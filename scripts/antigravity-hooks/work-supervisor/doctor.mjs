import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadLedger, verifyLedgerIntegrity, stateDir } from "./audit-ledger.mjs";
import { listQuarantine } from "./quarantine.mjs";
import { hasIntent, hasGoals, loadIntent, loadGoals, loadContract } from "./investigation-discipline.mjs";

export function runDoctor(workspaceRoot) {
	const checks = [];
	let healthy = true;

	checks.push(checkNodeVersion());
	checks.push(checkLedger(workspaceRoot));
	checks.push(checkQuarantine(workspaceRoot));
	checks.push(checkIntent(workspaceRoot));
	checks.push(checkGoals(workspaceRoot));
	checks.push(checkContract(workspaceRoot));
	checks.push(checkStateDir(workspaceRoot));

	for (const check of checks) {
		if (check.status !== "ok") healthy = false;
	}

	return {
		healthy,
		checks,
	};
}

function checkNodeVersion() {
	const major = process.versions.node.split(".")[0];
	const ok = parseInt(major, 10) >= 20;
	return {
		name: "Node.js version",
		status: ok ? "ok" : "warn",
		detail: `Node.js ${process.versions.node} (requires >=20)`,
	};
}

function checkLedger(workspaceRoot) {
	try {
		const dir = stateDir(workspaceRoot);
		const ledgerPath = join(dir, "audit-ledger.jsonl");
		if (!existsSync(ledgerPath)) {
			return { name: "Audit ledger", status: "ok", detail: "no ledger (clean workspace)" };
		}
		const entries = loadLedger(workspaceRoot);
		const integrity = verifyLedgerIntegrity(workspaceRoot);
		if (!integrity) {
			return { name: "Audit ledger", status: "error", detail: `INTEGRITY FAIL: ${entries.length} entries, hash-chain broken` };
		}
		return { name: "Audit ledger", status: "ok", detail: `${entries.length} entries, hash-chain verified` };
	} catch (e) {
		return { name: "Audit ledger", status: "error", detail: e.message };
	}
}

function checkQuarantine(workspaceRoot) {
	try {
		const records = listQuarantine(workspaceRoot);
		if (records.length === 0) {
			return { name: "Quarantine", status: "ok", detail: "empty" };
		}
		return {
			name: "Quarantine",
			status: "ok",
			detail: `${records.length} records (cap: 64 / 16 MiB / 7 days)`,
		};
	} catch (e) {
		return { name: "Quarantine", status: "error", detail: e.message };
	}
}

function checkIntent(workspaceRoot) {
	try {
		if (hasIntent(workspaceRoot)) {
			const intent = loadIntent(workspaceRoot);
			return { name: "Intent checkpoint", status: "ok", detail: `goal: ${intent?.goal?.slice(0, 60) || "unknown"}` };
		}
		return { name: "Intent checkpoint", status: "ok", detail: "not set" };
	} catch (e) {
		return { name: "Intent checkpoint", status: "error", detail: e.message };
	}
}

function checkGoals(workspaceRoot) {
	try {
		if (hasGoals(workspaceRoot)) {
			const goals = loadGoals(workspaceRoot);
			const count = Array.isArray(goals?.goals) ? goals.goals.length : 0;
			return { name: "Goals checkpoint", status: "ok", detail: `${count} goals` };
		}
		return { name: "Goals checkpoint", status: "ok", detail: "not set" };
	} catch (e) {
		return { name: "Goals checkpoint", status: "error", detail: e.message };
	}
}

function checkContract(workspaceRoot) {
	try {
		const contract = loadContract(workspaceRoot);
		if (contract) {
			return { name: "R1 contract", status: "ok", detail: `goal: ${contract.restated_goal?.slice(0, 60) || "unknown"}` };
		}
		return { name: "R1 contract", status: "ok", detail: "no active contract" };
	} catch (e) {
		return { name: "R1 contract", status: "error", detail: e.message };
	}
}

function checkStateDir(workspaceRoot) {
	try {
		const dir = stateDir(workspaceRoot);
		const stat = statSync(dir);
		return { name: "State directory", status: "ok", detail: dir };
	} catch (e) {
		return { name: "State directory", status: "error", detail: e.message };
	}
}
