#!/usr/bin/env node
import { stdin, stdout, exit } from "node:process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

async function readStdin() {
	return new Promise((resolve) => {
		let data = "";
		stdin.setEncoding("utf8");
		stdin.on("data", (chunk) => {
			data += chunk;
		});
		stdin.once("end", () => resolve(data));
		stdin.once("error", () => resolve(""));
		if (stdin.isTTY) {
			resolve("");
		}
	});
}

// Helper to run shell commands safely
function runCmd(cmd, cwd) {
	try {
		return execSync(cmd, { cwd, encoding: "utf8", timeout: 1500 }).trim();
	} catch {
		return "";
	}
}

async function getLspDiagnostics(cwd, files) {
	try {
		const { callDiagnosticsViaDaemon, currentRequestContext } = require("@code-yeongyu/lsp-daemon");
		const diagnostics = [];
		const promises = files.slice(0, 3).map(async (file) => {
			const absolutePath = join(cwd, file);
			if (!existsSync(absolutePath)) return;
			try {
				const result = await Promise.race([
					callDiagnosticsViaDaemon(absolutePath, { context: currentRequestContext() }),
					new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 1500))
				]);
				const text = result.content.map((block) => block.text).join("\n").trim();
				if (text && !text.includes("No diagnostics found")) {
					diagnostics.push(`- LSP Warnings/Errors in ${file}:\n${text}`);
				}
			} catch {
				// Ignore daemon timeout or connection error
			}
		});
		await Promise.all(promises);
		return diagnostics.join("\n\n");
	} catch {
		return "";
	}
}

async function main() {
	const rawInput = await readStdin();
	if (!rawInput.trim()) {
		exit(0);
	}

	let payload;
	try {
		payload = JSON.parse(rawInput);
	} catch {
		exit(0);
	}

	const cwd = payload.cwd || process.cwd();
	const prompt = payload.prompt || "";

	// Ignore if recovering from context pressure
	const recoveryWords = ["context compacted", "context_length_exceeded", "context_too_large"];
	if (recoveryWords.some(word => prompt.toLowerCase().includes(word))) {
		exit(0);
	}

	const lowerPrompt = prompt.toLowerCase();
	let roleInstructions = "";
	if (lowerPrompt.includes("planner") || lowerPrompt.includes("planning")) {
		roleInstructions = `
<role-instructions type="planner">
1. Focus exclusively on task decomposition, wave sequencing, and dependency mapping.
2. You MUST think step-by-step and outline your logic path in a detailed <thinking-process> block before outputting waves.
3. Do not write production code edits; focus on Wave boundary design.
</role-instructions>
`.trim();
	} else if (lowerPrompt.includes("explorer") || lowerPrompt.includes("librarian") || lowerPrompt.includes("researcher") || lowerPrompt.includes("search")) {
		roleInstructions = `
<role-instructions type="researcher">
1. Search the codebase comprehensively. Identify exact file names, functions, and lines.
2. Formulate hypotheses as "HYPOTHESIS[id]: <claim> | status: open" and verify them against actual file reads.
3. Keep findings fully cited (e.g. file:line or official doc URLs).
</role-instructions>
`.trim();
	} else if (lowerPrompt.includes("verifier") || lowerPrompt.includes("reviewer") || lowerPrompt.includes("qa") || lowerPrompt.includes("check")) {
		roleInstructions = `
<role-instructions type="verifier">
1. Actively assume the implementation contains bugs, regressions, or visual anomalies.
2. Review code diffs line-by-line; check for type safety, missing error handling, or performance slops.
3. For UI or terminal output, enforce CJK text clipping, responsive wrap limits, and alignment checks.
4. Do not trust worker reports; verify by re-running tests and inspection commands.
</role-instructions>
`.trim();
	} else if (lowerPrompt.includes("worker") || lowerPrompt.includes("implementation") || lowerPrompt.includes("debugging")) {
		roleInstructions = `
<role-instructions type="worker">
1. Apply the smallest, cleanest, type-safe change that satisfies the success criteria.
2. Adhere to zero-slop coding guidelines: keep functions under 250 lines, avoid "any" types, and check imports.
3. Ensure any new file edits are locked by unit/integration tests before claiming completion.
</role-instructions>
`.trim();
	}

	let additionalContextParts = [];
	if (roleInstructions) {
		additionalContextParts.push(roleInstructions);
	}

	// 1. Gather Project Rules (AGENTS.md)
	const agentsMdPath = join(cwd, "AGENTS.md");
	if (existsSync(agentsMdPath)) {
		try {
			const content = readFileSync(agentsMdPath, "utf8");
			// Extract first 2500 characters
			const rulesSnippet = content.slice(0, 2500).trim();
			additionalContextParts.push(`<project-rules>\n${rulesSnippet}\n</project-rules>`);
		} catch {}
	}

	// 2. Gather Notepad/Memory (.omx/notepad.md)
	const notepadPath = join(cwd, ".omx", "notepad.md");
	if (existsSync(notepadPath)) {
		try {
			const content = readFileSync(notepadPath, "utf8").trim();
			if (content) {
				additionalContextParts.push(`<notepad>\n${content.slice(0, 2000)}\n</notepad>`);
			}
		} catch {}
	}

	// 3. Gather Project Memory (.omx/project-memory.json)
	const memoryPath = join(cwd, ".omx", "project-memory.json");
	if (existsSync(memoryPath)) {
		try {
			const rawMem = readFileSync(memoryPath, "utf8").trim();
			const parsed = JSON.parse(rawMem);
			if (parsed && typeof parsed === "object") {
				const memorySnippet = JSON.stringify(parsed, null, 2);
				additionalContextParts.push(`<project-memory>\n${memorySnippet.slice(0, 2000)}\n</project-memory>`);
			}
		} catch {}
	}

	// 4. Gather LSP diagnostics for recently modified files
	const modifiedFilesRaw = runCmd("git status --porcelain", cwd);
	if (modifiedFilesRaw) {
		const files = modifiedFilesRaw
			.split("\n")
			.map(line => line.trim().slice(3).trim())
			.filter(file => {
				const ext = file.split(".").pop();
				return ["ts", "tsx", "go", "py", "rs"].includes(ext);
			});
		if (files.length > 0) {
			const lspFeedback = await getLspDiagnostics(cwd, files);
			if (lspFeedback) {
				additionalContextParts.push(`<active-code-diagnostics>\n${lspFeedback}\n</active-code-diagnostics>`);
			}
		}
	}

	// 5. Inject Gemini few-shot examples for precision and style
	const fewShotExamples = `
<few-shot-examples>
Example 1: High-rigor code replacement without comments or unnecessary explanations.
User Request: "Add validation check to ensure port is positive"
Current code:
\`\`\`typescript
export function startServer(port: number) {
  listen(port);
}
\`\`\`
Optimized Patch:
\`\`\`typescript
export function startServer(port: number) {
  if (port <= 0) {
    throw new Error("Port must be positive");
  }
  listen(port);
}
\`\`\`
Note: Return only the code modification, preserving strict type checks.
</few-shot-examples>
`.trim();
	additionalContextParts.push(fewShotExamples);

	if (additionalContextParts.length > 0) {
		const formattedDirectives = `
<system-directives-and-context>
The following instructions and context must be strictly adhered to during this implementation to maximize Gemini's reasoning efficiency:

${additionalContextParts.join("\n\n")}
</system-directives-and-context>
`.trim();

		const output = {
			hookSpecificOutput: {
				hookEventName: "UserPromptSubmit",
				additionalContext: formattedDirectives
			}
		};
		stdout.write(JSON.stringify(output) + "\n");
	}

	exit(0);
}

main();
