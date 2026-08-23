#!/usr/bin/env node
import { stdin as processStdin, stdout as processStdout } from "node:process";
import { searchMemoryFacts } from "./search.js";
import {
	formatActiveMemoryContext,
	getMemoryFilePath,
	readFacts,
	saveFact,
} from "./store.js";

const command = process.argv[2];
const subcommand = process.argv[3];

function readStdinPayload(): Promise<Record<string, unknown>> {
	return new Promise((resolve) => {
		let data = "";
		processStdin.setEncoding("utf8");
		processStdin.on("data", (chunk) => (data += chunk));
		processStdin.once("end", () => {
			try {
				resolve(JSON.parse(data));
			} catch {
				resolve({});
			}
		});
		processStdin.once("error", () => resolve({}));
		if (processStdin.isTTY) resolve({});
	});
}

if (command === "hook" && subcommand === "session-start") {
	const payload = await readStdinPayload();
	const cwd =
		typeof payload.cwd === "string" && payload.cwd.length > 0
			? payload.cwd
			: process.cwd();
	const facts = readFacts(getMemoryFilePath(cwd));
	const context = formatActiveMemoryContext(facts);
	if (context.length > 0) {
		const output = {
			hookSpecificOutput: {
				hookEventName: "SessionStart",
				additionalContext: context,
			},
		};
		processStdout.write(`${JSON.stringify(output)}\n`);
	}
} else if (command === "remember") {
	const text = process.argv.slice(3).join(" ");
	if (text.trim().length > 0) {
		const saved = saveFact(text, "fact");
		if (saved) {
			console.log(`Saved fact: ${saved.content}`);
		} else {
			console.log("Fact already exists or is empty.");
		}
	} else {
		process.stderr.write("Usage: omo-memory remember <fact text>\n");
	}
} else if (command === "search") {
	const query = process.argv.slice(3).join(" ");
	const result = searchMemoryFacts(process.cwd(), query);
	console.log(`=== Active Memory Search: "${query}" (${result.matchedFacts.length}/${result.totalFacts} matched) ===`);
	for (const f of result.matchedFacts) {
		console.log(`[${new Date(f.timestamp).toISOString()}] (${f.category}) ${f.content}`);
	}
} else if (command === "list") {
	const facts = readFacts();
	console.log(`=== Active Memory Facts (${facts.length}) ===`);
	for (const f of facts) {
		console.log(
			`[${new Date(f.timestamp).toISOString()}] (${f.category}) ${f.content}`,
		);
	}
} else {
	process.stderr.write(
		"Usage: omo-memory hook session-start | remember <text> | search <query> | list\n",
	);
	process.exitCode = 1;
}
