import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CommandExecutionAudit } from "../src/evidence-contract.js";
import { executeHostCommand } from "../src/host-executor.js";

export async function executeFixtureCommands(repoRoot: string, runId = "default-run") {
	await writeFile(
		join(repoRoot, "package.json"),
		JSON.stringify({ scripts: { test: "node --version", build: "node --version" } }),
	);
	const audits: CommandExecutionAudit[] = [];
	for (const args of [["test"], ["run", "build"]]) {
		const result = await executeHostCommand({
			command: "npm",
			args,
			cwd: repoRoot,
			runId,
			sessionId: "fixture-session",
			requestId: `fixture-${args.join("-")}`,
		});
		if (result.exitCode !== 0) throw new Error(result.stderr);
		audits.push({ command: ["npm", ...args].join(" "), exitCode: result.exitCode, executionBinding: result.binding });
	}
	return { commandAudits: audits, executionBinding: audits[0]?.executionBinding };
}
