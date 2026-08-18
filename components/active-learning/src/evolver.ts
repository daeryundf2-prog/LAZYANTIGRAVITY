import { existsSync, mkdirSync, appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { LearnedGotcha, ActiveLearningReport } from "./types.js";
import { extractFailurePatterns, readFailureEvents } from "./analyzer.js";

export function getMemoryPath(cwd: string = process.cwd()): string {
	const p1 = join(cwd, ".omo", "memory");
	const p2 = join(cwd, ".lazyantigravity", "memory");

	if (existsSync(p1)) return join(p1, "facts.jsonl");
	if (!existsSync(p2)) {
		mkdirSync(p2, { recursive: true });
	}
	return join(p2, "facts.jsonl");
}

export function evolveRules(cwd: string = process.cwd()): ActiveLearningReport {
	const events = readFailureEvents(cwd);
	const gotchas = extractFailurePatterns(events);
	const memoryFile = getMemoryPath(cwd);

	let existingContent = "";
	if (existsSync(memoryFile)) {
		try {
			existingContent = readFileSync(memoryFile, "utf8");
		} catch {}
	}

	const promoted: LearnedGotcha[] = [];

	for (const g of gotchas) {
		if (g.confidence >= 0.7 && !existingContent.includes(g.pattern)) {
			const factRecord = {
				id: g.id,
				timestamp: Date.now(),
				category: "gotcha",
				content: `[자가학습 Gotcha] ${g.suggestedRule}`,
			};
			appendFileSync(memoryFile, `${JSON.stringify(factRecord)}\n`, "utf8");
			promoted.push(g);
		}
	}

	return {
		analyzedEvents: events.length,
		identifiedPatterns: gotchas.length,
		promotedGotchas: promoted,
	};
}
