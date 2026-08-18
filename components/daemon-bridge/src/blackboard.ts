export interface BlackboardEntry<T = unknown> {
	key: string;
	value: T;
	timestamp: number;
	ttlMs?: number;
	agentId?: string;
	namespace?: string;
}

export class SharedBlackboard {
	private entries: Map<string, BlackboardEntry> = new Map();

	public set<T>(key: string, value: T, options: { ttlMs?: number; agentId?: string; namespace?: string } = {}): BlackboardEntry<T> {
		const entry: BlackboardEntry<T> = {
			key,
			value,
			timestamp: Date.now(),
			ttlMs: options.ttlMs,
			agentId: options.agentId,
			namespace: options.namespace || "default",
		};
		this.entries.set(key, entry as BlackboardEntry);
		return entry;
	}

	public get<T>(key: string): T | null {
		const entry = this.entries.get(key);
		if (!entry) return null;

		if (entry.ttlMs && Date.now() - entry.timestamp > entry.ttlMs) {
			this.entries.delete(key);
			return null;
		}

		return entry.value as T;
	}

	public delete(key: string): boolean {
		return this.entries.delete(key);
	}

	public list(namespace?: string): BlackboardEntry[] {
		const now = Date.now();
		const results: BlackboardEntry[] = [];

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

	public clear(): void {
		this.entries.clear();
	}

	public size(): number {
		return this.entries.size;
	}
}
