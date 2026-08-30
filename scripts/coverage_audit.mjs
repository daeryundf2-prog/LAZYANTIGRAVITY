#!/usr/bin/env node
/**
 * coverage_audit.mjs — 원문 대조 커버리지 감사 (순환 감사의 구조적 차단)
 * GUARD_PACK_VERSION: 1.0.0 (캐노니컬: lazyforensic/scripts — 수정 시 3레포 동기화)
 *
 * 배경: deepfake-forensic-radar 사후 감사(2026-08-30)에서 감사자가 "21/21 전수 일치"
 * 를 선언했으나 실제로는 자신이 만든 키워드 목록과 산출물을 대조하는 순환 감사였고,
 * 원문 항목 20여 개가 누락되어 있었다. 이 도구는 그 경로를 구조적으로 막는다:
 *
 *   1. --source 원문 파일이 없으면 실행을 거부한다 — 원문 없는 감사는 성립하지 않는다.
 *      (감사 전에 원문을 반드시 파일로 저장하라는 계약의 집행기)
 *   2. 감사 키를 산출물이 아니라 원문 항목에서만 뽑는다 — 자체 키워드 목록을 만들 수 없다.
 *   3. 모든 판정은 항목별 매핑(원문 행 → 산출 파일:행, 매칭 키) 수신증으로 남긴다.
 *
 * 사용법:
 *   node coverage_audit.mjs --source <원문.md> --target <산출1.md> [--target 산출2.md ...]
 *                           [--min 1.0] [--json <receipt.json>] [--max-item-lines 6]
 *
 * 종료 코드: 0 = 커버리지 ≥ min, 1 = 미달/누락, 2 = 사용 오류(원문 부재 포함).
 * 본 도구는 LLM 호출을 하지 않는다. 결정적 문자열 비교만 한다.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const GUARD_PACK_VERSION = '1.0.0';
const READ_CAP_BYTES = 2 * 1024 * 1024;

const STOPWORDS = new Set([
	// 한국어 고빈도 조사/어미·일반어, 영어 일반어 — 감사 키가 되면 전항목 오매칭된다
	'그리고', '그러나', '하지만', '또한', '따라서', '위해', '대한', '통해', '있는', '하는',
	'되는', '이는', '이런', '같은', '모든', '각각', '기반', '제공', '지원', '사용', '가능',
	'추가', '개요', '설명', '목록', '정리', '확인', '검증', '분석', '보고', '요청', '사례',
	'the', 'and', 'for', 'with', 'this', 'that', 'from', 'into', 'based', 'using', 'when',
	'what', 'how', 'why', 'are', 'was', 'were', 'have', 'has', 'not', 'you', 'your', 'can',
]);

function usage() {
	return `Usage: node coverage_audit.mjs --source <원문.md> --target <산출.md> [--target ...] [--min 1.0] [--json receipt.json]

원문(--source)의 항목을 레코드로 추출해 산출물(--target)에서 각 항목의 흔적을 찾고,
항목별 매핑 수신증을 출력한다. --source 가 없으면 감사를 거부한다 (순환 감사 차단).`;
}

function fail(msg, code = 2) {
	console.error(`[COVERAGE AUDIT v${GUARD_PACK_VERSION}] ${msg}`);
	process.exit(code);
}

function readFileCapped(file) {
	const fd = fs.openSync(file, 'r');
	try {
		const size = fs.fstatSync(fd).size;
		const len = Math.min(READ_CAP_BYTES, size);
		const buf = Buffer.alloc(len);
		fs.readSync(fd, buf, 0, len, 0);
		return buf.toString('utf-8');
	} finally {
		fs.closeSync(fd);
	}
}

// 마크다운 표기(굵은 글씨, 링크, 인라인 코드, 각주)를 평문으로 정규화
function normalize(text) {
	return text
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/`([^`]*)`/g, '$1')
		.replace(/\*\*([^*]*)\*\*/g, '$1')
		.replace(/\*([^*]*)\*/g, '$1')
		.replace(/~~([^~]*)~~/g, '$1')
		.replace(/\$([^$]*)\$/g, '$1')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

function isMeaningfulKey(token) {
	if (STOPWORDS.has(token)) return false;
	if (/\d/.test(token)) return token.length >= 2; // Wan2.1 → wan2 1 … 숫자 포함 토큰
	if (/[a-z]/.test(token)) return token.length >= 4; // 영어 소문자 일반어 잡음 제한
	return token.length >= 2; // 한글·기타 유니코드: 2자 이상
}

// 원문 한 레코드에서 감사 키(항목의 식별 흔적)를 뽑는다 — 산출물이 아니라 원문에서만
function extractKeys(recordText, commonTokens, docFreqLimit) {
	const tokens = normalize(recordText).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
	const keys = new Set();
	for (const token of tokens) {
		if (!isMeaningfulKey(token)) continue;
		if ((commonTokens.get(token) ?? 0) > docFreqLimit) continue; // 전 항목에 흔한 토큰 제외
		keys.add(token);
	}
	return [...keys];
}

// 원문 → 레코드(표 행/불릿/번호 항목). 헤딩은 레코드가 아니라 섹션 문맥으로 쓴다.
// 표 헤더 행(바로 다음 행이 구분자 행인 표 행)은 항목이 아니라 스키마라 제외한다.
function extractRecords(sourceText) {
	const lines = sourceText.split(/\r?\n/);
	const records = [];
	let section = '';
	let inFence = false;
	const isSeparatorRow = (text) => /^\s*\|(\s*:?-{2,}:?\s*\|)+\s*$/.test(text);
	for (let i = 0; i < lines.length; i += 1) {
		const raw = lines[i];
		if (/^\s*(```|~~~)/.test(raw)) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;
		const heading = raw.match(/^#{1,6}\s+(.*)$/);
		if (heading) {
			section = normalize(heading[1]);
			continue;
		}
		const tableRow = raw.match(/^\s*\|(.+)\|\s*$/);
		if (tableRow) {
			if (isSeparatorRow(raw)) continue; // 구분자 행
			if (i + 1 < lines.length && isSeparatorRow(lines[i + 1])) continue; // 표 헤더 행
			const cells = tableRow[1].split('|').map((c) => c.trim());
			records.push({ line: i + 1, section, text: cells.filter(Boolean).join(' — ') });
			continue;
		}
		const bullet = raw.match(/^\s*(?:[-*+]|\d+[.)])\s+(.*\S)\s*$/);
		if (bullet) {
			records.push({ line: i + 1, section, text: bullet[1] });
			continue;
		}
	}
	return records;
}

function buildTargetIndex(targetFiles) {
	const index = []; // { file, line, text(normalized) }
	for (const file of targetFiles) {
		const lines = readFileCapped(file).split(/\r?\n/);
		lines.forEach((line, i) => {
			const text = normalize(line);
			if (text) index.push({ file, line: i + 1, text });
		});
	}
	return index;
}

function sha256File(file) {
	return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
	console.log(usage());
	process.exit(0);
}

function parseArgs() {
	const parsed = { targets: [], min: 1.0, json: null, source: null };
	for (let i = 0; i < args.length; i += 1) {
		if (args[i] === '--source') parsed.source = args[++i];
		else if (args[i] === '--target') parsed.targets.push(args[++i]);
		else if (args[i] === '--min') parsed.min = Number(args[++i]);
		else if (args[i] === '--json') parsed.json = args[++i];
		else fail(`알 수 없는 인자: ${args[i]}\n${usage()}`);
	}
	return parsed;
}

const opts = parseArgs();

// 1차 관문: 원문 부재 → 감사 거부 (순환 감사 차단의 핵심)
if (!opts.source) fail(`감사 거부 — --source 원문 파일이 없다. 원문 없이 감사 키를 만드는 것은 순환 감사다.\n먼저 감사 대상 원문을 파일로 저장한 뒤 다시 실행하라.\n${usage()}`);
if (!fs.existsSync(opts.source)) fail(`감사 거부 — 원문 파일을 찾을 수 없다: ${opts.source}\n${usage()}`);
if (opts.targets.length === 0) fail(`감사 거부 — --target 산출물이 없다.\n${usage()}`);
for (const t of opts.targets) {
	if (!fs.existsSync(t)) fail(`감사 거부 — 산출 파일을 찾을 수 없다: ${t}\n${usage()}`);
}
if (!(opts.min >= 0 && opts.min <= 1)) fail(`--min 은 0 이상 1 이하: ${opts.min}\n${usage()}`);

const sourceText = readFileCapped(opts.source);
const records = extractRecords(sourceText);
if (records.length === 0) fail('감사 거부 — 원문에서 레코드(표 행/불릿/번호 항목)를 하나도 추출하지 못했다. 원문 형식을 확인하라.');

// 전 항목에 흔한 토큰(레코드의 34% 초과 등장)은 키에서 제외 — 오매칭 방지
const tokenDocFreq = new Map();
for (const rec of records) {
	const seen = new Set(normalize(rec.text).split(/[^\p{L}\p{N}]+/u).filter(Boolean));
	for (const token of seen) tokenDocFreq.set(token, (tokenDocFreq.get(token) ?? 0) + 1);
}
const docFreqLimit = Math.max(3, Math.ceil(records.length * 0.34));
const commonTokens = new Map([...tokenDocFreq.entries()].filter(([, n]) => n > docFreqLimit));

const targetIndex = buildTargetIndex(opts.targets);

const perItem = [];
const missing = [];
let covered = 0;

for (const rec of records) {
	const keys = extractKeys(rec.text, commonTokens, docFreqLimit);
	// 강한 키(숫자 포함 또는 6자 이상 고유 토큰)가 있으면 그것만 증거로 인정한다 —
	// 산출물 제목/서문에 우연히 등장한 약한 토큰("구조" 등)의 오매칭을 막는다.
	const strongKeys = keys.filter((k) => /\d/.test(k) || k.length >= 6);
	const searchKeys = strongKeys.length > 0 ? strongKeys : keys;
	const matchedIn = [];
	for (const key of searchKeys) {
		for (const entry of targetIndex) {
			if (entry.text.includes(key)) {
				matchedIn.push({ key, file: entry.file, line: entry.line });
				if (matchedIn.length >= 3) break; // 항목당 최초 3개 증거면 충분
			}
		}
		if (matchedIn.length >= 3) break;
	}
	const status = matchedIn.length > 0 ? 'COVERED' : 'MISSING';
	if (matchedIn.length > 0) covered += 1;
	const item = {
		id: `S${String(rec.line).padStart(4, '0')}`,
		sourceLine: rec.line,
		section: rec.section.slice(0, 60),
		excerpt: normalize(rec.text).slice(0, 110),
		keys,
		status,
		evidence: matchedIn,
	};
	if (status === 'MISSING') missing.push(item);
	perItem.push(item);
}

const rate = records.length > 0 ? covered / records.length : 0;
const pass = rate >= opts.min;

const receipt = {
	tool: 'coverage_audit',
	guardPackVersion: GUARD_PACK_VERSION,
	generatedAt: new Date().toISOString(),
	source: { path: opts.source, sha256: sha256File(opts.source), records: records.length },
	targets: opts.targets.map((t) => ({ path: t, sha256: sha256File(t) })),
	minRequired: opts.min,
	totalItems: records.length,
	coveredItems: covered,
	missingItems: missing.length,
	coverageRate: Math.round(rate * 10000) / 10000,
	verdict: pass ? 'PASS' : 'FAIL',
	missing,
	perItem,
};

const summary = [
	`[COVERAGE AUDIT v${GUARD_PACK_VERSION}] ${pass ? 'PASS' : 'FAIL'} — ${covered}/${records.length} 항목 커버리지 ${(rate * 100).toFixed(1)}% (요구 ≥ ${(opts.min * 100).toFixed(0)}%)`,
	`  원문: ${opts.source} (sha256 ${receipt.source.sha256.slice(0, 16)}…)`,
	`  산출: ${opts.targets.join(', ')}`,
];
if (missing.length > 0) {
	summary.push(`  누락 ${missing.length}개 항목 (원문 행 기준):`);
	for (const rec of missing.slice(0, 20)) {
		summary.push(`    - L${rec.sourceLine} [${rec.section || '본문'}] ${rec.excerpt.slice(0, 90)}`);
	}
	if (missing.length > 20) summary.push(`    - … 외 ${missing.length - 20}개 (수신증 JSON 참조)`);
}
console.log(summary.join('\n'));

if (opts.json) {
	fs.writeFileSync(opts.json, JSON.stringify(receipt, null, 2) + '\n', 'utf-8');
	console.log(`  수신증: ${opts.json}`);
} else {
	console.log(JSON.stringify(receipt, null, 2));
}

process.exit(pass ? 0 : 1);
