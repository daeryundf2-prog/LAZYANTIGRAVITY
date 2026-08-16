import { appendFileSync, existsSync, mkdirSync, readFileSync, } from "node:fs";
import { join } from "node:path";
export function getMemoryFilePath(cwd = process.cwd()) {
    // Check for existing .omo/memory or .lazyantigravity/memory
    const omoPath = join(cwd, ".omo", "memory");
    if (existsSync(omoPath)) {
        return join(omoPath, "facts.jsonl");
    }
    const lazyPath = join(cwd, ".lazyantigravity", "memory");
    if (!existsSync(lazyPath)) {
        mkdirSync(lazyPath, { recursive: true });
    }
    return join(lazyPath, "facts.jsonl");
}
export function readFacts(filePath) {
    const path = filePath ?? getMemoryFilePath();
    if (!existsSync(path))
        return [];
    const facts = [];
    try {
        const raw = readFileSync(path, "utf8");
        for (const line of raw.split(/\r?\n/)) {
            if (line.trim().length === 0)
                continue;
            try {
                const item = JSON.parse(line);
                if (item && typeof item.content === "string") {
                    facts.push({
                        id: item.id ||
                            `fact-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                        timestamp: item.timestamp || Date.now(),
                        category: item.category || "fact",
                        content: item.content.trim(),
                    });
                }
            }
            catch { }
        }
    }
    catch { }
    return facts;
}
export function saveFact(content, category = "fact", filePath) {
    const trimmed = content.trim();
    if (trimmed.length === 0)
        return null;
    const path = filePath ?? getMemoryFilePath();
    const existing = readFacts(path);
    // Deduplication check
    const isDuplicate = existing.some((f) => f.content.toLowerCase() === trimmed.toLowerCase());
    if (isDuplicate)
        return null;
    const record = {
        id: `fact-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
        category,
        content: trimmed,
    };
    appendFileSync(path, `${JSON.stringify(record)}\n`, "utf8");
    return record;
}
export function formatActiveMemoryContext(facts) {
    if (facts.length === 0)
        return "";
    const lines = [
        "<project-active-memory>",
        "# Persistent Project Facts & Working Memory",
        "These verified project facts, conventions, and architectural gotchas were preserved across previous sessions:",
    ];
    for (const fact of facts.slice(-20)) {
        const prefix = fact.category === "gotcha"
            ? "⚠️ [GOTCHA]"
            : fact.category === "preference"
                ? "⭐ [PREFERENCE]"
                : "📌 [FACT]";
        lines.push(`- ${prefix} ${fact.content}`);
    }
    lines.push("</project-active-memory>");
    return lines.join("\n");
}
