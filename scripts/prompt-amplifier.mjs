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

// Safely slice markdown ensuring unclosed code blocks are handled
function safeMarkdownSlice(text, limit) {
	if (text.length <= limit) return text;
	let sliced = text.slice(0, limit);
	const codeBlocks = (sliced.match(/```/g) || []).length;
	if (codeBlocks % 2 !== 0) {
		sliced += "\n```";
	}
	return sliced + "\n... [truncated]";
}

// Safely slice JSON content and repair bracket balances
function safeJsonSlice(obj, limit) {
	const str = JSON.stringify(obj, null, 2);
	if (str.length <= limit) return str;
	
	let sliced = str.slice(0, limit);
	sliced = sliced.replace(/,\s*$/, "");
	
	let openBraces = (sliced.match(/\{/g) || []).length;
	let closeBraces = (sliced.match(/\}/g) || []).length;
	let openBrackets = (sliced.match(/\[/g) || []).length;
	let closeBrackets = (sliced.match(/\]/g) || []).length;
	
	while (openBrackets > closeBrackets) {
		sliced += "\n]";
		closeBrackets++;
	}
	while (openBraces > closeBraces) {
		sliced += "\n}";
		closeBraces++;
	}
	
	return sliced + "\n/* ... [truncated] */";
}

// Sanitize sensitive information like API keys, secrets, passwords
function sanitizeSecrets(text) {
	if (typeof text !== "string") return text;
	const secretRegexes = [
		/(?:api[_-]?key|secret|password|passwd|token|private[_-]?key|auth[_-]?key|credentials|jwt|session[_-]?id)\s*[:=]\s*["']?([a-zA-Z0-9_\-\.\~]{10,})["']?/gi,
		/(?:aws[_-]?access[_-]?key[_-]?id|aws[_-]?secret[_-]?access[_-]?key)\s*[:=]\s*["']?([a-zA-Z0-9_\-\.\~]{16,})["']?/gi,
		/(?:bearer\s+)(eyJ[a-zA-Z0-9_\-\.]+\.[a-zA-Z0-9_\-\.]+\.[a-zA-Z0-9_\-\.]+)/gi
	];
	let sanitized = text;
	for (const regex of secretRegexes) {
		sanitized = sanitized.replace(regex, (match, captured) => {
			return match.replace(captured, "[REDACTED_SECRET]");
		});
	}
	return sanitized;
}

// Dynamically resolve supported LSP extensions from config files
function getLspSupportedExtensions(cwd) {
	const defaultExts = ["ts", "tsx", "js", "jsx", "go", "py", "rs", "c", "cpp", "h", "hpp", "java", "kt", "cs", "swift", "rb", "php", "dart", "ex", "exs", "zig", "sh", "bat"];
	const extensions = new Set(defaultExts);
	
	// Check .codex/lsp-client.json to append config-specific languages/extensions
	const codexConfigPath = join(cwd, ".codex", "lsp-client.json");
	if (existsSync(codexConfigPath)) {
		try {
			const config = JSON.parse(readFileSync(codexConfigPath, "utf8"));
			if (config && typeof config === "object") {
				for (const key of Object.keys(config)) {
					if (key.startsWith(".")) {
						extensions.add(key.slice(1));
					} else if (key.includes(".")) {
						const part = key.split(".").pop();
						if (part) extensions.add(part);
					} else {
						extensions.add(key);
					}
				}
			}
		} catch {}
	}
	
	return Array.from(extensions);
}

async function getLspDiagnostics(cwd, files) {
	try {
		const { callDiagnosticsViaDaemon, currentRequestContext } = require("@code-yeongyu/lsp-daemon");
		const diagnostics = [];
		const promises = files.slice(0, 5).map(async (file) => {
			const absolutePath = join(cwd, file);
			if (!existsSync(absolutePath)) return;
			try {
				const result = await Promise.race([
					callDiagnosticsViaDaemon(absolutePath, { context: currentRequestContext() }),
					new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 800))
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
			additionalContextParts.push(`<project-rules>\n${sanitizeSecrets(rulesSnippet)}\n</project-rules>`);
		} catch {}
	}

	// 2. Gather Notepad/Memory (.omx/notepad.md)
	const notepadPath = join(cwd, ".omx", "notepad.md");
	if (existsSync(notepadPath)) {
		try {
			const content = readFileSync(notepadPath, "utf8").trim();
			if (content) {
				additionalContextParts.push(`<notepad>\n${sanitizeSecrets(safeMarkdownSlice(content, 2000))}\n</notepad>`);
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
				additionalContextParts.push(`<project-memory>\n${sanitizeSecrets(safeJsonSlice(parsed, 2000))}\n</project-memory>`);
			}
		} catch {}
	}

	// 4. Gather LSP diagnostics for recently modified files
	const modifiedFilesRaw = runCmd("git status --porcelain", cwd);
	if (modifiedFilesRaw) {
		const supportedExts = getLspSupportedExtensions(cwd);
		const files = modifiedFilesRaw
			.split("\n")
			.map(line => {
				if (line.length < 4) return null;
				const status = line.slice(0, 2);
				const filePathPart = line.slice(3).trim();
				let filePath = filePathPart;
				// handle renamed files "file1 -> file2"
				if (filePathPart.includes(" -> ")) {
					filePath = filePathPart.split(" -> ").pop().trim().replace(/^"(.*)"$/, "$1");
				} else {
					filePath = filePathPart.replace(/^"(.*)"$/, "$1");
				}
				// Modified = 3, Added = 2, Untracked = 1
				let priority = 1;
				if (status.includes("M")) priority = 3;
				else if (status.includes("A")) priority = 2;
				return { file: filePath, priority };
			})
			.filter(item => {
				if (!item || !item.file) return false;
				const ext = item.file.split(".").pop();
				return supportedExts.includes(ext);
			})
			.sort((a, b) => b.priority - a.priority)
			.map(item => item.file);
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
