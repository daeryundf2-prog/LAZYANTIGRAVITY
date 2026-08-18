export class SharedBlackboard {
    entries = new Map();
    set(key, value, options = {}) {
        const entry = {
            key,
            value,
            timestamp: Date.now(),
            ttlMs: options.ttlMs,
            agentId: options.agentId,
            namespace: options.namespace || "default",
        };
        this.entries.set(key, entry);
        return entry;
    }
    get(key) {
        const entry = this.entries.get(key);
        if (!entry)
            return null;
        if (entry.ttlMs && Date.now() - entry.timestamp > entry.ttlMs) {
            this.entries.delete(key);
            return null;
        }
        return entry.value;
    }
    delete(key) {
        return this.entries.delete(key);
    }
    list(namespace) {
        const now = Date.now();
        const results = [];
        for (const [key, entry] of this.entries.entries()) {
            if (entry.ttlMs && now - entry.timestamp > entry.ttlMs) {
                this.entries.delete(key);
                continue;
            }
            if (!namespace || entry.namespace === namespace) {
                results.push(entry);
            }
        }
        return results;
    }
    clear() {
        this.entries.clear();
    }
    size() {
        return this.entries.size;
    }
}
