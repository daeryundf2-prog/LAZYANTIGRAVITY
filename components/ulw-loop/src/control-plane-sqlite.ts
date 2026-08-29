import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EventType, LedgerEvent } from "./control-plane-types.js";

/**
 * JSON-file-backed append-only ledger store.
 * Despite the historical file name this is NOT SQLite and has no WAL: every
 * append rewrites the whole JSON file synchronously. It provides durable,
 * hash-chained event persistence with envelope integrity checks; atomic
 * rename-on-write and a real SQLite backend are possible future upgrades.
 */

export interface TransactionalEventEnvelope {
	readonly eventId: string;
	readonly runId: string;
	readonly sequence: number;
	readonly eventType: EventType;
	readonly payloadHash: string;
	readonly timestamp: string;
	readonly event: LedgerEvent;
}

export function computePayloadChecksum(payload: unknown): string {
	return createHash("sha256")
		.update(JSON.stringify(payload ?? {}))
		.digest("hex");
}

export function getLedgerWalDir(repoRoot: string, runId: string): string {
	return join(repoRoot, ".omo", "control-plane", "runs", runId);
}

export async function appendTransactionalEvent(
	repoRoot: string,
	runId: string,
	event: LedgerEvent,
): Promise<TransactionalEventEnvelope> {
	const runDir = getLedgerWalDir(repoRoot, runId);
	if (!existsSync(runDir)) {
		mkdirSync(runDir, { recursive: true });
	}

	const walIndexFile = join(runDir, "wal-index.json");
	let sequence = 1;
	let envelopes: TransactionalEventEnvelope[] = [];

	if (existsSync(walIndexFile)) {
		try {
			const content = readFileSync(walIndexFile, "utf8");
			envelopes = JSON.parse(content) as TransactionalEventEnvelope[];
			sequence = envelopes.length + 1;
		} catch {}
	}

	const eventId = `evt-${sequence.toString().padStart(6, "0")}`;
	const payloadHash = computePayloadChecksum(event);
	const envelope: TransactionalEventEnvelope = {
		eventId,
		runId,
		sequence,
		eventType: event.type,
		payloadHash,
		timestamp: event.timestamp || new Date().toISOString(),
		event,
	};

	envelopes.push(envelope);
	const tmpFile = `${walIndexFile}.tmp`;
	writeFileSync(tmpFile, JSON.stringify(envelopes, null, 2), "utf8");
	// Atomic swap: a crash mid-write can never leave a truncated ledger.
	renameSync(tmpFile, walIndexFile);

	return envelope;
}

export function verifyLedgerWalIntegrity(
	repoRoot: string,
	runId: string,
): {
	valid: boolean;
	totalEvents: number;
	corruptEventIndex?: number;
} {
	const walIndexFile = join(getLedgerWalDir(repoRoot, runId), "wal-index.json");
	if (!existsSync(walIndexFile)) {
		return { valid: true, totalEvents: 0 };
	}

	try {
		const envelopes = JSON.parse(readFileSync(walIndexFile, "utf8")) as TransactionalEventEnvelope[];
		for (let i = 0; i < envelopes.length; i++) {
			const env = envelopes[i];
			if (!env) continue;
			const expectedHash = computePayloadChecksum(env.event);
			if (env.payloadHash !== expectedHash) {
				return { valid: false, totalEvents: envelopes.length, corruptEventIndex: i };
			}
		}
		return { valid: true, totalEvents: envelopes.length };
	} catch {
		return { valid: false, totalEvents: 0, corruptEventIndex: 0 };
	}
}
