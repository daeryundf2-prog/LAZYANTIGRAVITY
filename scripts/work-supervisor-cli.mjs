import { resolve } from "node:path";
import { runDoctor } from "./antigravity-hooks/work-supervisor/doctor.mjs";
import { generateScorecard } from "./antigravity-hooks/work-supervisor/scorecard.mjs";
import { checkMigration, migrateState } from "./antigravity-hooks/work-supervisor/state-migration.mjs";
import { checkEnvironmentConflicts } from "./antigravity-hooks/work-supervisor/runtime-env.mjs";
import { listQuarantine, clearQuarantine } from "./antigravity-hooks/work-supervisor/quarantine.mjs";

const command = process.argv[2];
const rootArg = process.argv[3] === "--root" ? process.argv[4] : process.cwd();
const workspaceRoot = resolve(rootArg);

switch (command) {
	case "doctor": {
		const result = runDoctor(workspaceRoot);
		for (const check of result.checks) {
			const icon = check.status === "ok" ? "✓" : check.status === "warn" ? "⚠" : "✗";
			console.log(`${icon} ${check.name}: ${check.detail}`);
		}
		console.log(`\nOverall: ${result.healthy ? "HEALTHY" : "UNHEALTHY"}`);
		process.exit(result.healthy ? 0 : 1);
	}
	case "scorecard": {
		const result = generateScorecard(workspaceRoot);
		console.log(JSON.stringify(result, null, 2));
		break;
	}
	case "status": {
		const migration = checkMigration(workspaceRoot);
		const env = checkEnvironmentConflicts();
		const doctor = runDoctor(workspaceRoot);
		console.log(JSON.stringify({
			layout: migration.layout,
			authority: migration.authority,
			env_conflicts: env.conflict_count,
			healthy: doctor.healthy,
		}, null, 2));
		break;
	}
	case "migrate": {
		const checkOnly = process.argv.includes("--check");
		if (checkOnly) {
			const status = checkMigration(workspaceRoot);
			console.log(JSON.stringify(status, null, 2));
		} else {
			const result = migrateState(workspaceRoot);
			console.log(JSON.stringify(result, null, 2));
		}
		break;
	}
	case "quarantine": {
		const sub = process.argv[3];
		if (sub === "list") {
			const records = listQuarantine(workspaceRoot);
			console.log(JSON.stringify(records, null, 2));
		} else if (sub === "clear") {
			clearQuarantine(workspaceRoot);
			console.log("Quarantine cleared.");
		} else {
			const records = listQuarantine(workspaceRoot);
			console.log(`Quarantine: ${records.length} records`);
			for (const r of records) {
				console.log(`  ${r.command.slice(0, 60)} | ${r.reason} | age: ${Math.floor((Date.now() - r.ts) / 1000)}s`);
			}
		}
		break;
	}
	default:
		console.log(`Usage: node scripts/work-supervisor-cli.mjs <command> [--root <path>]

Commands:
  doctor         Run health diagnostics
  scorecard      Show per-agent coordination scorecard
  status         Show runtime status (layout, env, health)
  migrate        Migrate legacy state to canonical
  migrate --check  Check migration status without writing
  quarantine     List blocked destructive commands
  quarantine list  Same as above
  quarantine clear  Clear all quarantine records
`);
		process.exit(2);
}
