import { existsSync, statSync } from "node:fs";
import { loadLedger, appendLedgerEntry, canonicalizePath } from "./audit-ledger.mjs";

export function createBrief(workspaceRoot, params) {
	const brief = {
		paths: params.paths || [],
		verify_cmd: params.verifyCmd || "",
		sentinel: params.sentinel || "",
		target: params.target || "default",
		created_at: Date.now(),
		agent_key: params.agentKey || "unknown",
	};
	appendLedgerEntry(workspaceRoot, {
		type: "brief_created",
		agent_key: brief.agent_key,
		paths: brief.paths,
		verify_cmd: brief.verify_cmd,
		sentinel: brief.sentinel,
		target: brief.target,
	});
	return brief;
}

export function checkDelegation(workspaceRoot, params) {
	const ledger = loadLedger(workspaceRoot);
	const agentKey = params.agentKey || "unknown";
	const sinceFile = params.sinceFile;
	const sinceTs = sinceFile && existsSync(sinceFile) ? getFileMtime(sinceFile) : 0;

	const briefs = ledger.filter(
		(e) => e.type === "brief_created" && e.agent_key === agentKey && e.ts >= sinceTs,
	);
	const mutations = ledger.filter(
		(e) => e.type === "file_write" && e.agent_key === agentKey && e.ts >= sinceTs,
	);
	const verifications = ledger.filter(
		(e) => e.type === "verification" && e.agent_key === agentKey && e.ts >= sinceTs && e.exit_ok === true,
	);

	const unverifiedPaths = [];
	for (const brief of briefs) {
		const briefPaths = (brief.paths || []).map((p) => canonicalizePath(workspaceRoot, p) || p);
		for (const p of briefPaths) {
			const mutationsForPath = mutations.filter((m) => {
				const mPaths = (m.paths || []).map((mp) => canonicalizePath(workspaceRoot, mp) || mp);
				return mPaths.some((mp) => mp === p || mp.startsWith(p + "/"));
			});
			const lastMutationSeq = mutationsForPath.length > 0
				? mutationsForPath[mutationsForPath.length - 1].seq || 0
				: 0;
			const hasCoveringVerification = verifications.some((v) => (v.seq || 0) >= lastMutationSeq);
			if (mutationsForPath.length > 0 && !hasCoveringVerification) {
				unverifiedPaths.push(p);
			}
		}
	}

	const sentinelPresent = briefs.length > 0 && briefs.some((b) => b.sentinel && existsSync(b.sentinel));

	return {
		brief_count: briefs.length,
		mutation_count: mutations.length,
		verification_count: verifications.length,
		unverified_paths: unverifiedPaths,
		sentinel_present: sentinelPresent,
		compliant: unverifiedPaths.length === 0 && (briefs.length === 0 || sentinelPresent || verifications.length > 0),
	};
}

function getFileMtime(path) {
	try {
		return statSync(path).mtimeMs;
	} catch {
		return 0;
	}
}
