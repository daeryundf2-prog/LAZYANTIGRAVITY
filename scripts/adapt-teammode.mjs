#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(__dirname, "..");

console.log("=== Adapting Codex Teammode for Antigravity Subagents ===");

const teamSessionId = process.argv[2];
if (!teamSessionId) {
	console.error("Usage: node adapt-teammode.mjs <team_session_id>");
	process.exit(1);
}

const teamDir = join(root, ".omo", "teams", teamSessionId);
const guidePath = join(teamDir, "guide.md");

if (!existsSync(guidePath)) {
	console.error(`No guide.md found at ${teamDir}. Please initialize the team first.`);
	process.exit(1);
}

try {
	let guideContent = readFileSync(guidePath, "utf8");

	// Replace Codex thread creation guidelines with Antigravity invoke_subagent suggestions
	const adaptiveInstructions = `
> [!NOTE]
> **Antigravity Harness Adaptation**:
> In Antigravity, instead of codex_app.create_thread, spawn team workers using:
> \`\`\`json
> invoke_subagent(Subagents: [{
>   TypeName: "self",
>   Role: "[Team Member Name]",
>   Prompt: "ACT as a team member. FOCUS: [Focus Area]. READ .omo/teams/${teamSessionId}/guide.md"
> }])
> \`\`\`
> Communicate with workers via \`send_message(Recipient: "<subagent_conversation_id>", Message: "...")\`.
`.trim();

	if (!guideContent.includes("Antigravity Harness Adaptation")) {
		guideContent = guideContent.replace(
			/# Guide for team/g,
			`# Guide for team\n\n${adaptiveInstructions}`
		);
		writeFileSync(guidePath, guideContent, "utf8");
		console.log(`Successfully adapted ${guidePath} for Antigravity subagents!`);
	} else {
		console.log("Teammode guide already adapted.");
	}
} catch (error) {
	console.error("Failed to adapt teammode guide:", error);
	process.exit(1);
}
