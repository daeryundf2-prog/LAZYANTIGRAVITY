import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
export function computePayloadChecksum(payload) {
    return createHash("sha256")
        .update(JSON.stringify(payload ?? {}))
        .digest("hex");
}
export function getLedgerWalDir(repoRoot, runId) {
    return join(repoRoot, ".omo", "control-plane", "runs", runId);
}
const WAL_MIGRATED_CACHE_LIMIT = 64;
const walCountCache = new Map();
function legacyIndexFile(runDir) {
    return join(runDir, "wal-index.json");
}
function jsonlIndexFile(runDir) {
    return join(runDir, "wal-index.jsonl");
}
// 레거시 wal-index.json을 JSONL로 한 번 전환한다 — 구버전 실행 기록 감사 가능성 유지.
function migrateLegacyIndex(runDir) {
    const jsonl = jsonlIndexFile(runDir);
    const legacy = legacyIndexFile(runDir);
    if (existsSync(jsonl) || !existsSync(legacy))
        return;
    try {
        const envelopes = JSON.parse(readFileSync(legacy, "utf8"));
        const tmp = `${jsonl}.tmp`;
        writeFileSync(tmp, envelopes.map((e) => `${JSON.stringify(e)}\n`).join(""), "utf8");
        renameSync(tmp, jsonl);
    }
    catch { /* 깨진 레거시 파일은 검증기가 보고한다 — append를 막지 않는다 */ }
}
function readEnvelopes(runDir) {
    const jsonl = jsonlIndexFile(runDir);
    const legacy = legacyIndexFile(runDir);
    const out = [];
    const source = existsSync(jsonl) ? jsonl : existsSync(legacy) ? legacy : null;
    if (source === null)
        return out;
    try {
        for (const line of readFileSync(source, "utf8").split("\n")) {
            const trimmed = line.trim();
            if (!trimmed)
                continue;
            try {
                out.push(JSON.parse(trimmed));
            }
            catch { /* corrupted line — verifyLedgerWalIntegrity reports it */ }
        }
    }
    catch { /* unreadable file — treated as empty */ }
    return out;
}
function cachedEnvelopeCount(runDir) {
    const file = jsonlIndexFile(runDir);
    const cacheKey = runDir;
    const cached = walCountCache.get(cacheKey);
    try {
        const size = statSync(file).size;
        if (cached !== undefined && cached.fileSize === size)
            return cached.count;
        let count = 0;
        for (const line of readFileSync(file, "utf8").split("\n")) {
            if (line.trim().length > 0)
                count += 1;
        }
        walCountCache.set(cacheKey, { fileSize: size, count });
        if (walCountCache.size > WAL_MIGRATED_CACHE_LIMIT) {
            const oldest = walCountCache.keys().next().value;
            if (oldest !== undefined)
                walCountCache.delete(oldest);
        }
        return count;
    }
    catch {
        return null; // 파일이 아직 없다 — 첫 append
    }
}
export async function appendTransactionalEvent(repoRoot, runId, event) {
    const runDir = getLedgerWalDir(repoRoot, runId);
    if (!existsSync(runDir)) {
        mkdirSync(runDir, { recursive: true });
    }
    migrateLegacyIndex(runDir);
    const jsonl = jsonlIndexFile(runDir);
    const cachedCount = cachedEnvelopeCount(runDir);
    let sequence;
    if (cachedCount !== null) {
        sequence = cachedCount + 1;
    }
    else {
        sequence = readEnvelopes(runDir).length + 1;
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
    // 단일 appendFileSync — O(1). 부분 줄은 파서가 건너뛰고 검증기가 보고한다.
    appendFileSync(jsonl, `${JSON.stringify(envelope)}\n`, "utf8");
    try {
        const size = statSync(jsonl).size;
        walCountCache.set(runDir, { fileSize: size, count: sequence });
    }
    catch { /* 카운트 캐시 갱신 실패 시 다음 append가 콜드 카운트로 회복한다 */ }
    return envelope;
}
export function verifyLedgerWalIntegrity(repoRoot, runId) {
    const envelopes = readEnvelopes(getLedgerWalDir(repoRoot, runId));
    if (envelopes.length === 0) {
        // 읽을 것이 전혀 없는 것과 '깨진 파일'은 다르다 — legacy 변환 실패 등은
        // 파일이 존재하는지로 구분한다.
        const runDir = getLedgerWalDir(repoRoot, runId);
        const hasAnyStore = existsSync(jsonlIndexFile(runDir)) || existsSync(legacyIndexFile(runDir));
        return hasAnyStore ? { valid: false, totalEvents: 0, corruptEventIndex: 0 } : { valid: true, totalEvents: 0 };
    }
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
