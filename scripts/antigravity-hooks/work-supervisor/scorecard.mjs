import { loadLedger, stateDir } from "./audit-ledger.mjs";
import { listQuarantine } from "./quarantine.mjs";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function generateScorecard(workspaceRoot) {
	const ledger = loadLedger(workspaceRoot);
	const quarantine = listQuarantine(workspaceRoot);
	const agents = {};
	let totalBlocks = 0;
	let totalAllows = 0;
	let totalDenials = 0;
	let totalScopeDrift = 0;
	let totalFailOpenEscapes = 0;
	let totalVerifications = 0;

	for (const entry of ledger) {
		const agentKey = entry.agent_key || "unknown";
		if (!agents[agentKey]) {
			agents[agentKey] = {
				blocks: 0,
				allows: 0,
				denials: 0,
				scope_drift: 0,
				fail_open_escapes: 0,
				verifications: 0,
				invocations: 0,
				settled: 0,
			};
		}
		switch (entry.type) {
			case "invocation":
				agents[agentKey].invocations++;
				if (entry.settled) agents[agentKey].settled++;
				break;
			case "scope_drift":
				agents[agentKey].scope_drift++;
				totalScopeDrift++;
				break;
			case "fail_open_escape":
				agents[agentKey].fail_open_escapes++;
				totalFailOpenEscapes++;
				break;
			case "verification":
				agents[agentKey].verifications++;
				totalVerifications++;
				break;
		}
	}

	const agentSummary = Object.entries(agents).map(([key, stats]) => ({
		agent_key: key,
		...stats,
		health_score: computeHealthScore(stats),
	}));

	return {
		summary: {
			total_entries: ledger.length,
			total_blocks: totalBlocks,
			total_allows: totalAllows,
			total_denials: totalDenials,
			total_scope_drift: totalScopeDrift,
			total_fail_open_escapes: totalFailOpenEscapes,
			total_verifications: totalVerifications,
			quarantine_records: quarantine.length,
		},
		agents: agentSummary,
	};
}

function computeHealthScore(stats) {
	const { invocations, settled, scope_drift, fail_open_escapes, verifications } = stats;
	if (invocations === 0) return 100;
	const settledRatio = settled / invocations;
	const driftPenalty = Math.min(scope_drift * 5, 30);
	const failOpenPenalty = Math.min(fail_open_escapes * 10, 40);
	const verifyBonus = Math.min(verifications * 3, 15);
	const score = (settledRatio * 100) - driftPenalty - failOpenPenalty + verifyBonus;
	return Math.max(0, Math.min(100, Math.round(score)));
}
