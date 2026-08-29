import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
export function computePayloadChecksum(payload) {
    return createHash("sha256")
        .update(JSON.stringify(payload ?? {}))
        .digest("hex");
}
export function getLedgerWalDir(repoRoot, runId) {
    return join(repoRoot, ".omo", "control-plane", "runs", runId);
}
export async function appendTransactionalEvent(repoRoot, runId, event) {
    const runDir = getLedgerWalDir(repoRoot, runId);
    if (!existsSync(runDir)) {
        mkdirSync(runDir, { recursive: true });
    }
    const walIndexFile = join(runDir, "wal-index.json");
    let sequence = 1;
    let envelopes = [];
    if (existsSync(walIndexFile)) {
        try {
            const content = readFileSync(walIndexFile, "utf8");
            envelopes = JSON.parse(content);
            sequence = envelopes.length + 1;
        }
        catch { }
    }
    const eventId = `evt-${sequence.toString().padStart(6, "0")}`;
    const payloadHash = computePayloadChecksum(event);
    const envelope = {
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
export function verifyLedgerWalIntegrity(repoRoot, runId) {
    const walIndexFile = join(getLedgerWalDir(repoRoot, runId), "wal-index.json");
    if (!existsSync(walIndexFile)) {
        return { valid: true, totalEvents: 0 };
    }
    try {
        const envelopes = JSON.parse(readFileSync(walIndexFile, "utf8"));
        for (let i = 0; i < envelopes.length; i++) {
            const env = envelopes[i];
            if (!env)
                continue;
            const expectedHash = computePayloadChecksum(env.event);
            if (env.payloadHash !== expectedHash) {
                return { valid: false, totalEvents: envelopes.length, corruptEventIndex: i };
            }
        }
        return { valid: true, totalEvents: envelopes.length };
    }
    catch {
        return { valid: false, totalEvents: 0, corruptEventIndex: 0 };
    }
}
