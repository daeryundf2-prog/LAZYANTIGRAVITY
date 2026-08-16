import { printJson } from "./cli-output.js";
import { dispatchAgentScenario } from "./dry-run-agent-scenarios.js";
import { runConsensusLiveInvocation } from "./dry-run-consensus-live.js";
import { runConsensusStaticScenario } from "./dry-run-consensus-scenarios.js";
import { dispatchErrorScenario } from "./dry-run-error-scenarios.js";
import { printFinalOutput } from "./dry-run-helpers.js";
import { runRewindScenario } from "./dry-run-rewind-scenarios.js";
import { dispatchStagnationQualityScenario } from "./dry-run-stagnation-quality.js";
import type { DryRunContext, DryRunState } from "./dry-run-types.js";
import { DRY_RUN_HELP, SCENARIO_NAMES } from "./dry-run-types.js";

export async function dryRunCmd(repoRoot: string, argv: readonly string[], json: boolean): Promise<number> {
	if (argv.includes("--help") || argv.includes("-h") || argv.includes("help")) {
		if (json) {
			printJson({
				ok: true,
				dryRun: true,
				usage: true,
				scenarios: [...SCENARIO_NAMES],
				options: ["--scenario", "--json", "--write-checkpoint", "--persist-checkpoint"],
			});
		} else {
			process.stdout.write(`${DRY_RUN_HELP}\n`);
		}
		return 0;
	}

	const writeCheckpoint = argv.includes("--write-checkpoint") || argv.includes("--persist-checkpoint");
	const writeLedger = argv.includes("--write-ledger");

	let scenario: string = "happy-path";
	const scenarioIdx = argv.indexOf("--scenario");
	if (scenarioIdx !== -1) {
		const val = argv[scenarioIdx + 1];
		if (val) {
			scenario = val;
		}
	}

	const ctx: DryRunContext = {
		repoRoot,
		json,
		writeCheckpoint,
		writeLedger,
		platform: "Antigravity",
		selectedModel: "Gemini 3.7 Flash (High)",
		userResumeCommand: "/ulw resume",
		internalResumeCommand: "omo ulw-loop resume",
		wouldSwitchModel: false,
		allRoles: ["planner", "researcher", "worker", "verifier", "finalizer"],
	};

	const state: DryRunState = {
		completedRoles: [],
		failedRole: null,
		errorType: null,
		checkpointPath: null,
		nextRecommendedAction: "",
		isQualityScenario: false,
		qualityStatus: "",
		qualityStage: "",
	};

	if (await dispatchErrorScenario(scenario, ctx, state)) {
	} else if (await dispatchAgentScenario(scenario, ctx)) {
	} else if (dispatchStagnationQualityScenario(scenario, ctx, state)) {
	} else if (await runRewindScenario(scenario, ctx)) {
		return 0;
	} else if (scenario === "consensus-live-invocation") {
		await runConsensusLiveInvocation(ctx, state);
	} else if (scenario.startsWith("consensus-")) {
		await runConsensusStaticScenario(scenario, ctx, state);
	} else {
		process.stderr.write(`[Dry-Run] Unknown scenario: ${scenario}\n`);
		return 1;
	}

	printFinalOutput(state, ctx, scenario);
	return 0;
}
