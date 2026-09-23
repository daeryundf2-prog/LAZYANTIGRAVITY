import { readFileSync } from "node:fs";
import { scanSourceFiles } from "./cache.js";
/**
 * Async Blocking Call Checker (code-yeongyu mechanical gate).
 *
 * 정적 스캔으로 두 패턴을 사전 반려한다:
 *  1. `sync-io-in-async` — async 함수 본문 안의 동기 I/O 호출
 *     (readFileSync, execSync 등 — 이벤트 루프를 블로킹)
 *  2. `ignored-result` — `Result<...>` 반환 함수를 async 본문에서
 *     await/return/바인딩 없이 단독 문장으로 호출해 결과를 무시
 *
 * indexer.ts와 동일하게 정규식+브레이스 깊이 추적 기반 경량 스캐너다.
 * 타입 체커가 아니므로 근사치다 — 오탐 허용 범위는 최소화한다.
 */
const SYNC_IO_CALLS = new Set([
    "readFileSync",
    "writeFileSync",
    "appendFileSync",
    "readdirSync",
    "statSync",
    "lstatSync",
    "fstatSync",
    "existsSync",
    "mkdirSync",
    "mkdtempSync",
    "rmSync",
    "rmdirSync",
    "unlinkSync",
    "renameSync",
    "copyFileSync",
    "cpSync",
    "readSync",
    "writeSync",
    "openSync",
    "closeSync",
    "realpathSync",
    "execSync",
    "execFileSync",
    "spawnSync",
]);
const ASYNC_FN_RE = /(?:export\s+)?(?:async\s+function\s+\w+|async\s*\(|const\s+\w+\s*=\s*async|async\s+\w+\s*\()/;
const RESULT_FN_RE = /(?:function|const)\s+([a-zA-Z0-9_$]+)[^={]*(?:=>\s*|:\s*)(?:Promise<\s*)?Result</;
function collectResultReturningFns(lines) {
    const names = new Set();
    for (const line of lines) {
        const m = line.match(RESULT_FN_RE);
        if (m)
            names.add(m[1]);
    }
    return names;
}
export function checkFileBlocking(filePath) {
    const findings = [];
    const lines = readFileSync(filePath, "utf8").split("\n");
    const resultFns = collectResultReturningFns(lines);
    let depth = 0;
    let inAsync = false;
    let asyncName = "";
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        const opens = (line.match(/\{/g) || []).length;
        const closes = (line.match(/\}/g) || []).length;
        if (!inAsync && ASYNC_FN_RE.test(trimmed)) {
            inAsync = true;
            const nameMatch = trimmed.match(/(?:function|const)\s+([a-zA-Z0-9_$]+)/);
            asyncName = nameMatch
                ? nameMatch[1]
                : (trimmed.match(/async\s+(\w+)/)?.[1] ?? "(anonymous)");
        }
        if (inAsync) {
            for (const m of trimmed.matchAll(/\b([a-zA-Z0-9_$]+Sync)\s*\(/g)) {
                if (SYNC_IO_CALLS.has(m[1])) {
                    findings.push({
                        file: filePath,
                        line: i + 1,
                        rule: "sync-io-in-async",
                        detail: `${asyncName}() 내 동기 I/O 호출 ${m[1]}() — 이벤트 루프 블로킹`,
                    });
                }
            }
            const bare = trimmed.match(/^([a-zA-Z0-9_$]+)\s*\(.*\)\s*;?\s*(?:\/\/.*)?$/);
            if (bare && resultFns.has(bare[1])) {
                findings.push({
                    file: filePath,
                    line: i + 1,
                    rule: "ignored-result",
                    detail: `Result 반환 함수 ${bare[1]}()의 결과 무시 — await/return/바인딩 필요`,
                });
            }
        }
        depth += opens - closes;
        if (inAsync && depth <= 0 && (opens > 0 || closes > 0)) {
            inAsync = false;
            depth = Math.max(0, depth);
        }
    }
    return findings;
}
export function checkBlocking(targetDir) {
    const findings = [];
    for (const file of scanSourceFiles(targetDir)) {
        if (/\.(ts|tsx|js|mjs|cjs)$/.test(file)) {
            try {
                findings.push(...checkFileBlocking(file));
            }
            catch { }
        }
    }
    return findings;
}
