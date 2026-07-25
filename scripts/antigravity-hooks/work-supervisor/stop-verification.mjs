import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { loadLedger, appendLedgerEntry, stateDir } from "./audit-ledger.mjs";

const VERIFY_STATE_FILE = "verify-state.json";
const MAX_BOUNCES = 2;

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

export function runStopVerificationGate(input) {
	const workspaceRoot = selectWorkspace(input.workspacePaths);
	if (!workspaceRoot) return { decision: "stop" };

	const transcript = readTranscript(input.transcriptPath);
	if (!transcript) return { decision: "stop" };

	const state = readVerifyState(input.artifactDirectoryPath);
	const hasRunVerification = checkVerificationEvidence(transcript);
	const hasUnverifiedChanges = hasUnsettledChanges(workspaceRoot, transcript);

	if (hasRunVerification && !hasUnverifiedChanges) {
		clearVerifyState(input.artifactDirectoryPath);
		return { decision: "stop" };
	}

	const key = `${input.conversationId}`;
	const attempts = state?.key === key ? (state.attempts || 0) + 1 : 1;

	if (attempts > MAX_BOUNCES) {
		clearVerifyState(input.artifactDirectoryPath);
		appendLedgerEntry(workspaceRoot, {
			type: "fail_open_escape",
			agent_key: key,
			reason: hasUnverifiedChanges ? "unverified_changes" : "no_verification_evidence",
			attempts,
		});
		return { decision: "stop" };
	}

	writeVerifyState(input.artifactDirectoryPath, { key, attempts });

	const missing = [];
	if (!hasRunVerification) missing.push("검증 명령 실행 (test/build/lint/typecheck)");
	if (hasUnverifiedChanges) missing.push("변경 후 검증 재실행 (파일 변경이 감지됨, 검증이 변경 전이면 무효)");

	const reason = `show-me-the-work: 완료 전 증명이 부족합니다. 누락: ${missing.join(", ")}. ` +
		`시도 ${attempts}/${MAX_BOUNCES}. 검증 명령을 실행한 후 다시 시도하세요.`;

	return { decision: "continue", reason };
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

function hasUnsettledChanges(workspaceRoot, transcript) {
	const ledger = loadLedger(workspaceRoot);
	const lastVerifyIdx = transcript.lastIndexOf("npm test") || transcript.lastIndexOf("pytest") || transcript.lastIndexOf("bun test");
	if (lastVerifyIdx < 0) return true;
	const lastVerifyTs = ledger.find((e) => e.type === "invocation" && e.ts);
	if (!lastVerifyTs) return false;
	const recentMutations = ledger.filter(
		(e) => e.type === "invocation" && e.paths && e.paths.length > 0 && e.ts > (lastVerifyTs.ts || 0),
	);
	return recentMutations.length > 0;
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
