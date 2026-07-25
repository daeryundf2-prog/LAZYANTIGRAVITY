import { loadLedger, appendLedgerEntry, stateDir } from "./audit-ledger.mjs";
import { existsSync } from "node:fs";
import { join } from "node:path";

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
	const sinceTs = sinceFile && existsSync(sinceFile)
		? getFileMtime(sinceFile)
		: 0;

	const briefs = ledger.filter(
		(e) => e.type === "brief_created" && e.agent_key === agentKey && e.ts >= sinceTs,
	);
	const mutations = ledger.filter(
		(e) => e.type === "invocation" && e.agent_key === agentKey && e.ts >= sinceTs,
	);
	const verifications = ledger.filter(
		(e) => e.type === "verification" && e.agent_key === agentKey && e.ts >= sinceTs,
	);

	const unverifiedPaths = [];
	for (const brief of briefs) {
		const briefPaths = brief.paths || [];
		for (const p of briefPaths) {
			const hasMutation = mutations.some((m) => (m.paths || []).includes(p));
			const hasVerification = verifications.length > 0;
			if (hasMutation && !hasVerification) {
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
		const stat = existsSync(path) ? require("node:fs").statSync(path) : null;
		return stat ? stat.mtimeMs : 0;
	} catch {
		return 0;
	}
}
