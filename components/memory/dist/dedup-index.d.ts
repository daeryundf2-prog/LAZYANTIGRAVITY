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
export declare function contentHash(content: string): string;
export interface DedupIndex {
    has(content: string): boolean;
    add(content: string): void;
    size(): number;
}
export declare function loadDedupIndex(filePath: string): DedupIndex;
