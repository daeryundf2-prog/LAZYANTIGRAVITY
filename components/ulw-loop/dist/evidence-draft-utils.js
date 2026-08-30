import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
export function countFileSha256Pair(repoRoot, file) {
    const target = resolve(repoRoot, file);
    if (!existsSync(target))
        return { exists: false, lines: 0, sha256: null };
    const content = readFileSync(target);
    const sha256 = createHash("sha256").update(content).digest("hex");
    const text = content.toString("utf8");
    return { exists: true, lines: text.split("\n").length, sha256 };
}
export function fileLineCount(repoRoot, file) {
    const target = resolve(repoRoot, file);
    if (!existsSync(target))
        return null;
    return readFileSync(target, "utf8").split("\n").length;
}
