import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { loadLedger, appendLedgerEntry, stateDir } from "./audit-ledger.mjs";
import { appendAgentEvent } from "./agent-log.mjs";

const VERIFY_STATE_FILE = "verify-state.json";
const MAX_STOP_BLOCKS = 2;
const DOCS_ONLY_EXTENSIONS = new Set([".md", ".txt", ".rst", ".adoc", ".org"]);
const SCOPE_BUDGET_BYTES = 256 * 1024 * 1024;
const SCOPE_BUDGET_ENTRIES = 10_000;

const VERIFICATION_PATTERNS = [
	/\bnpm\s+test\b/,
	/\bnpm\s+run\s+(test|spec|check|lint|typecheck|tsc)\b/,
	/\bbun\s+(test|run\s+test)\b/,
	/\byarn\s+(test|test:unit)\b/,
	/\bpnpm\s+(test|test:unit)\b/,
	/\bpytest\b/,
	/\bpython\s+-m\s+pytest\b/,
	/\bpython\s+-m\s+unittest\b/,
	/\bcargo\s+(test|clippy|build)\b/,
	/\bgo\s+(test|vet|build)\b/,
	/\brustc\b/,
	/\bmake\b/,
	/\bcmake\s+--build\b/,
	/\bdotnet\s+(test|build)\b/,
	/\bmvn\s+(test|verify)\b/,
	/\bgradle\s+(test|check|build)\b/,
	/\brake\s+test\b/,
	/\bjest\b/,
	/\bvitest\b/,
	/\bplaywright\s+(test|run)\b/,
	/\bcypress\s+run\b/,
	/\bk6\s+run\b/,
	/\bdeno\s+(test|lint)\b/,
	/\bzig\s+test\b/,
	/\bswift\s+test\b/,
	/\bxcodebuild\s+(test|build)\b/,
	/\bflutter\s+test\b/,
	/\bdart\s+test\b/,
	/\bruff\s+check\b/,
	/\beslint\b/,
	/\bts-standard\b/,
	/\bstandard\b/,
	/\bshellcheck\b/,
];

const HYPOTHESIS_RE = /(?:가설|Hypothesis)\s*\d+\s*:/i;
const REJECTION_RE = /(?:기각|Rejected)\s*:/i;
const EVIDENCE_RE = /(?:증거|Evidence)\s*:/i;

const REASON_CODES = {
	STOP_VERIFICATION_MISSING: "stop_verification_missing",
	STOP_PROVENANCE_INCOMPLETE: "stop_provenance_incomplete",
	STOP_INVESTIGATION_MARKERS: "stop_investigation_markers",
	STOP_PROVENANCE_SCOPE_TOO_LARGE: "stop_provenance_scope_too_large",
	CAP_ALLOW: "cap_allow",
	ALLOW: "allow",
	BLOCK: "block",
	RECOVER: "recover",
};

const RESOLUTIONS = {
	NONE: "none",
	OBSERVATION: "observation",
	MARKERS: "markers",
	VERIFICATION: "verification",
};

export function runStopVerificationGate(input) {
	const workspaceRoot = selectWorkspace(input.workspacePaths);
	if (!workspaceRoot) return { decision: "stop" };

	const transcript = readTranscript(input.transcriptPath);
	if (!transcript) return { decision: "stop" };

	const agentKey = `antigravity:${input.conversationId}`;
	const ledger = loadLedger(workspaceRoot);
	const state = readVerifyState(input.artifactDirectoryPath);
	const key = verifyStateKey(input);

	if (isDocsOnlyTurn(ledger, agentKey)) {
		recordScorecard(workspaceRoot, agentKey, REASON_CODES.ALLOW, RESOLUTIONS.OBSERVATION, "docs-only turn");
		clearVerifyState(input.artifactDirectoryPath);
		return { decision: "stop" };
	}

	const scopeCheck = checkProvenanceScope(ledger, agentKey);
	if (scopeCheck.tooLarge) {
		const result = evaluateWithoutIO({
			transcript,
			ledger,
			agentKey,
			scopeCheck,
		});
		if (result.decision === "block") {
			return blockStop(input, workspaceRoot, agentKey, state, key, result.reason, result.reason_code);
		}
	}

	const hasRunVerification = hasSuccessfulVerification(transcript, ledger, agentKey);
	const hasUnverifiedChanges = hasUnsettledChanges(workspaceRoot, ledger, agentKey, transcript);
	const hasInvestigationMarkers = checkInvestigationMarkers(transcript);
	const provenanceComplete = isProvenanceComplete(ledger, agentKey);

	const missing = [];
	let reasonCode = null;

	if (!hasRunVerification) {
		missing.push("검증 명령 실행 (test/build/lint/typecheck)");
		reasonCode = REASON_CODES.STOP_VERIFICATION_MISSING;
	}
	if (hasUnverifiedChanges) {
		missing.push("변경 후 검증 재실행 (파일 변경이 감지됨, 검증이 변경 전이면 무효)");
		reasonCode = REASON_CODES.STOP_VERIFICATION_MISSING;
	}
	if (!hasInvestigationMarkers && hasModification(ledger, agentKey)) {
		missing.push("조사 마커 (가설/증거/기각)");
		reasonCode = REASON_CODES.STOP_INVESTIGATION_MARKERS;
	}
	if (!provenanceComplete) {
		missing.push("프로브넌스 관측 불완전 (compaction 후 미관측 변경)");
		reasonCode = REASON_CODES.STOP_PROVENANCE_INCOMPLETE;
	}
	if (scopeCheck.tooLarge) {
		missing.push(`스코프 예산 초과 (${scopeCheck.entryCount} entries / ${scopeCheck.byteCount} bytes)`);
		reasonCode = REASON_CODES.STOP_PROVENANCE_SCOPE_TOO_LARGE;
	}

	if (missing.length === 0) {
		recordScorecard(workspaceRoot, agentKey, REASON_CODES.ALLOW, RESOLUTIONS.VERIFICATION, "all gates passed");
		appendAgentEvent(workspaceRoot, agentKey, {
			event: "turn_finished",
			host: "antigravity",
			session_id: input.conversationId,
		});
		clearVerifyState(input.artifactDirectoryPath);
		return { decision: "stop" };
	}

	return blockStop(input, workspaceRoot, agentKey, state, key, formatReason(missing, state, key), reasonCode);
}

function verifyStateKey(input) {
	return `${input.artifactDirectoryPath}|${input.conversationId}`;
}

function blockStop(input, workspaceRoot, agentKey, state, key, reason, reasonCode) {
	const attempts = state?.key === key ? (state.attempts || 0) + 1 : 1;

	if (attempts > MAX_STOP_BLOCKS) {
		clearVerifyState(input.artifactDirectoryPath);
		appendLedgerEntry(workspaceRoot, {
			type: "fail_open_escape",
			agent_key: agentKey,
			reason: reasonCode,
			attempts,
		});
		recordScorecard(workspaceRoot, agentKey, REASON_CODES.CAP_ALLOW, RESOLUTIONS.NONE,
			`allowing after max ${MAX_STOP_BLOCKS} blocks`);
		return { decision: "stop" };
	}

	writeVerifyState(input.artifactDirectoryPath, { key, attempts });
	recordScorecard(workspaceRoot, agentKey, REASON_CODES.BLOCK, RESOLUTIONS.NONE, reasonCode);

	return { decision: "continue", reason };
}

function formatReason(missing, state, key) {
	const attempts = state?.key === key ? (state.attempts || 0) + 1 : 1;
	return `show-me-the-work: 완료 전 증명이 부족합니다. Show me the work.\n` +
		`누락: ${missing.join(", ")}.\n` +
		`시도 ${attempts}/${MAX_STOP_BLOCKS}. 검증 명령을 실행한 후 다시 시도하세요.`;
}

function evaluateWithoutIO(params) {
	const { transcript, ledger, agentKey, scopeCheck } = params;
	if (scopeCheck.tooLarge) {
		return {
			decision: "block",
			reason_code: REASON_CODES.STOP_PROVENANCE_SCOPE_TOO_LARGE,
			reason: `scope_too_large: ${scopeCheck.entryCount} entries / ${scopeCheck.byteCount} bytes (budget: ${SCOPE_BUDGET_ENTRIES} / ${SCOPE_BUDGET_BYTES})`,
		};
	}
	return { decision: "allow" };
}

function hasSuccessfulVerification(transcript, ledger, agentKey) {
	if (!checkVerificationEvidence(transcript)) return false;
	const lastMutationSeq = getLastMutationSeq(ledger, agentKey);
	const lastVerifySeq = getLastVerifySeq(ledger, agentKey);
	if (lastMutationSeq > 0 && lastVerifySeq > 0) {
		return lastVerifySeq >= lastMutationSeq;
	}
	return true;
}

function getLastMutationSeq(ledger, agentKey) {
	const mutations = ledger.filter((e) => e.agent_key === agentKey && e.type === "file_write" && e.paths?.length > 0);
	if (mutations.length === 0) return 0;
	return mutations[mutations.length - 1].seq || 0;
}

function getLastVerifySeq(ledger, agentKey) {
	const verifications = ledger.filter((e) => e.agent_key === agentKey && e.type === "verification");
	if (verifications.length === 0) return 0;
	return verifications[verifications.length - 1].seq || 0;
}

function checkInvestigationMarkers(transcript) {
	const hypothesisCount = (transcript.match(new RegExp(HYPOTHESIS_RE.source, "gi")) || []).length;
	const hasRejection = REJECTION_RE.test(transcript);
	const hasEvidence = EVIDENCE_RE.test(transcript);
	return hypothesisCount >= 3 && hasRejection && hasEvidence;
}

function hasModification(ledger, agentKey) {
	return ledger.some((e) => e.agent_key === agentKey && e.type === "file_write");
}

function isProvenanceComplete(ledger, agentKey) {
	const mutations = ledger.filter((e) => e.agent_key === agentKey && e.type === "file_write");
	const observations = ledger.filter((e) =>
		e.agent_key === agentKey && (e.type === "invocation" || e.type === "verification")
	);
	if (mutations.length === 0) return true;
	const lastMutationSeq = mutations[mutations.length - 1].seq || 0;
	const lastObservationSeq = observations.length > 0 ? observations[observations.length - 1].seq || 0 : 0;
	return lastObservationSeq >= lastMutationSeq;
}

function checkProvenanceScope(ledger, agentKey) {
	const entries = ledger.filter((e) => e.agent_key === agentKey);
	let byteCount = 0;
	let entryCount = entries.length;
	for (const entry of entries) {
		byteCount += Buffer.byteLength(JSON.stringify(entry), "utf8");
	}
	return {
		tooLarge: entryCount > SCOPE_BUDGET_ENTRIES || byteCount > SCOPE_BUDGET_BYTES,
		entryCount,
		byteCount,
	};
}

function isDocsOnlyTurn(ledger, agentKey) {
	const writes = ledger.filter((e) => e.agent_key === agentKey && e.type === "file_write");
	if (writes.length === 0) return true;
	return writes.every((w) => {
		const paths = w.paths || [];
		return paths.every((p) => DOCS_ONLY_EXTENSIONS.has(p.slice(p.lastIndexOf(".")).toLowerCase()));
	});
}

function recordScorecard(workspaceRoot, agentKey, action, resolution, detail) {
	appendLedgerEntry(workspaceRoot, {
		type: "scorecard_transition",
		agent_key: agentKey,
		action,
		resolution,
		detail,
		ts: Date.now(),
	});
}

function selectWorkspace(workspacePaths) {
	if (!Array.isArray(workspacePaths)) return null;
	for (const p of workspacePaths) {
		if (typeof p === "string" && p.length > 0 && existsSync(p)) return p;
	}
	return null;
}

function readTranscript(transcriptPath) {
	if (!transcriptPath || !existsSync(transcriptPath)) return null;
	try {
		return readFileSync(transcriptPath, "utf8");
	} catch {
		return null;
	}
}

function checkVerificationEvidence(transcript) {
	for (const pattern of VERIFICATION_PATTERNS) {
		if (pattern.test(transcript)) return true;
	}
	return false;
}

function hasUnsettledChanges(workspaceRoot, ledger, agentKey, transcript) {
	const mutations = ledger.filter((e) => e.agent_key === agentKey && e.type === "file_write" && e.paths?.length > 0);
	if (mutations.length === 0) return false;
	const verifications = ledger.filter((e) => e.agent_key === agentKey && e.type === "verification" && !e.error);
	if (verifications.length === 0) return true;
	const lastMutationSeq = mutations[mutations.length - 1].seq || 0;
	const lastVerifySeq = verifications[verifications.length - 1].seq || 0;
	return lastMutationSeq > lastVerifySeq;
}

function readVerifyState(artifactDir) {
	if (!artifactDir) return null;
	const path = join(artifactDir, VERIFY_STATE_FILE);
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return null;
	}
}

function writeVerifyState(artifactDir, state) {
	if (!artifactDir) return;
	const path = join(artifactDir, VERIFY_STATE_FILE);
	const tmp = `${path}.tmp-${process.pid}`;
	writeFileSync(tmp, JSON.stringify(state) + "\n", "utf8");
	renameSync(tmp, path);
}

function clearVerifyState(artifactDir) {
	if (!artifactDir) return;
	const path = join(artifactDir, VERIFY_STATE_FILE);
	if (existsSync(path)) {
		const tmp = `${path}.tmp-${process.pid}`;
		writeFileSync(tmp, "{}\n", "utf8");
		renameSync(tmp, path);
	}
}
