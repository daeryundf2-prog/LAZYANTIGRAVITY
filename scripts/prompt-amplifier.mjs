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
		for (const file of files.slice(0, 3)) {
			const absolutePath = join(cwd, file);
			if (!existsSync(absolutePath)) continue;
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
		}
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

	let additionalContextParts = [];

	// 1. Gather Project Rules (AGENTS.md)
	const agentsMdPath = join(cwd, "AGENTS.md");
	if (existsSync(agentsMdPath)) {
		try {
			const content = readFileSync(agentsMdPath, "utf8");
			// Extract first 2500 characters
			const rulesSnippet = content.slice(0, 2500).trim();
			additionalContextParts.push(`### [AGENTS.md Rules Summary]\n${rulesSnippet}`);
		} catch {}
	}

	// 2. Gather Notepad/Memory (.omx/notepad.md)
	const notepadPath = join(cwd, ".omx", "notepad.md");
	if (existsSync(notepadPath)) {
		try {
			const content = readFileSync(notepadPath, "utf8").trim();
			if (content) {
				additionalContextParts.push(`### [.omx/notepad.md Notes]\n${content.slice(0, 2000)}`);
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
				additionalContextParts.push(`### [Project Memory Directives]\n\`\`\`json\n${memorySnippet.slice(0, 2000)}\n\`\`\``);
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
				additionalContextParts.push(`### [Active Code Diagnostics & Warnings]\n${lspFeedback}`);
			}
		}
	}

	if (additionalContextParts.length > 0) {
		const formattedDirectives = `
[SYSTEM DIRECTIVES & WORKSPACE CONTEXT]
The following instructions and context must be strictly adhered to during this implementation to maximize Gemini's reasoning efficiency:

${additionalContextParts.join("\n\n")}
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
