import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
/**
 * Mantis-style deduplication ladder for facts.jsonl.
 *
 * Maintains a persisted content-hash set so saveFact() can reject duplicates
 * in O(1) instead of re-reading and string-comparing every fact (O(n)) on
 * each write. The sidecar index (`facts.jsonl.dedup.json`) is rebuilt lazily
 * whenever the facts file size no longer matches — appends are serialized by
 * the store's file lock, so a size match means the index is current.
 *
 * Hash input is normalized (trim + lowercase) to match the historical
 * case-insensitive duplicate semantics of saveFact().
 */
export function contentHash(content) {
    return createHash("sha256")
        .update(content.trim().toLowerCase(), "utf8")
        .digest("hex");
}
function sidecarPath(filePath) {
    return `${filePath}.dedup.json`;
}
function readSidecarHashes(filePath, factsSize) {
    const sp = sidecarPath(filePath);
    if (!existsSync(sp))
        return null;
    try {
        const sidecar = JSON.parse(readFileSync(sp, "utf8"));
        if (sidecar.factsSize === factsSize && Array.isArray(sidecar.hashes)) {
            return sidecar.hashes;
        }
    }
    catch { }
    return null;
}
function rebuildHashes(filePath) {
    if (!existsSync(filePath))
        return [];
    const hashes = [];
    try {
        for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
            if (line.trim().length === 0)
                continue;
            try {
                const item = JSON.parse(line);
                if (item && typeof item.content === "string") {
                    hashes.push(contentHash(item.content));
                }
            }
            catch { }
        }
    }
    catch { }
    return hashes;
}
export function loadDedupIndex(filePath) {
    const factsSize = existsSync(filePath) ? statSync(filePath).size : 0;
    const hashes = readSidecarHashes(filePath, factsSize) ?? rebuildHashes(filePath);
    const set = new Set(hashes);
    const persist = () => {
        try {
            writeFileSync(sidecarPath(filePath), JSON.stringify({
                factsSize: statSync(filePath).size,
                hashes: [...set],
            }), "utf8");
        }
        catch { }
    };
    if (hashes.length > 0 || existsSync(filePath))
        persist();
    return {
        has: (content) => set.has(contentHash(content)),
        add: (content) => {
            set.add(contentHash(content));
            persist();
        },
        size: () => set.size,
    };
}
