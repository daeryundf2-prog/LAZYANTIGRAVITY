#!/usr/bin/env node
/**
 * markdown_structure_guard.mjs — PostToolUse 마크다운 구조 무결성 가드
 * GUARD_PACK_VERSION: 1.0.0 (캐노니컬: lazyforensic/scripts — 수정 시 3레포 동기화)
 *
 * 임무: LLM 생성 파이프라인이 마크다운 작성 중 인라인 코드/링크 텍스트/강조를
 * 통째로 삭제하는 "스트리핑" 사고(빈 링크 [](...), 빈 불릿 "-  : ", 고아 $수식,
 * 미닫힘 코드펜스, 표 열 불일치)를 쓰기 직후 탐지해 재작성을 강제한다.
 *
 * 정직한 동작 규약:
 * - PostToolUse 사후 게이트다. 파일이 이미 쓰인 뒤 검사하며, 파일을 지우지 않는다.
 * - exit 1 = FAIL_CLOSED(호스트가 재작성 강제), exit 0 = 통과/스킵.
 * - 대상은 .md 만이다. 파일이 없거나 읽지 못하면 통과(오탐 방지).
 * - --check <경로...> 로 수동/CI 일괄 검사 모드를 지원한다(발견 시 exit 1).
 *
 * stdin 규약: hallucination_guard.mjs 와 동일 — 1.5초 데드라인 비동기 읽기.
 */
import fs from 'fs';
import path from 'path';
import { stdin } from 'node:process';

const GUARD_PACK_VERSION = '1.0.0';
const READ_CAP_BYTES = 2 * 1024 * 1024;

// ---------------------------------------------------------------------------
// 입력 수집 (hallucination_guard.mjs 와 동일 규약)
// ---------------------------------------------------------------------------

function readStdin(limitMs) {
	return new Promise((resolve) => {
		if (stdin.isTTY) {
			resolve('');
			return;
		}
		const chunks = [];
		let settled = false;
		const finish = (value) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			stdin.removeAllListeners();
			resolve(value);
		};
		const timer = setTimeout(() => finish(Buffer.concat(chunks).toString('utf8')), limitMs);
		stdin.on('data', (chunk) => chunks.push(chunk));
		stdin.on('end', () => finish(Buffer.concat(chunks).toString('utf8')));
		stdin.on('error', () => finish(''));
	});
}

function tryParseJson(text) {
	if (!text) return undefined;
	const t = text.trim();
	if (!t.startsWith('{') && !t.startsWith('[')) return undefined;
	try {
		return JSON.parse(t);
	} catch {
		return undefined;
	}
}

async function collectSources() {
	const sources = [];
	const push = (text, label) => {
		if (text) sources.push({ text, parsed: tryParseJson(text), label });
	};
	for (const k of ['ANTIGRAVITY_TOOL_INPUT', 'TOOL_INPUT', 'ANTIGRAVITY_TARGET_FILE', 'TARGET_FILE']) {
		if (process.env[k]) push(process.env[k], `env:${k}`);
	}
	push(await readStdin(1500), 'stdin');
	for (const arg of process.argv.slice(2)) push(arg, 'argv');
	return sources;
}

const TARGET_KEY_RE = /^(file_path|filepath|path|target|target_file|targetfile|target_path|targetpath|output)$/i;
const PATH_LIKE_RE = /([^\s"'`<>|;&]+[\/\\][^\s"'`<>|;&]+\.(?:md|html|txt|json))/i;
const REDIRECT_RE = /(?:>|>>)\s*([^\s|&;]+(?:\.(?:md|html|txt|json)))/i;

function extractTargetFromNode(node, out) {
	if (Array.isArray(node)) {
		for (const item of node) extractTargetFromNode(item, out);
		return;
	}
	if (!node || typeof node !== 'object') return;
	for (const [key, value] of Object.entries(node)) {
		if (typeof value === 'string' && value) {
			if (TARGET_KEY_RE.test(key)) out.push({ value, isCommand: false });
			else if (/^(command|cmd|command_line|commandline|script|args)$/i.test(key)) out.push({ value, isCommand: true });
		} else if (value && typeof value === 'object') {
			extractTargetFromNode(value, out);
		}
	}
}

function extractTarget(sources) {
	const env = process.env.ANTIGRAVITY_TARGET_FILE || process.env.TARGET_FILE || '';
	if (env) return env;
	for (const s of sources) {
		if (s.parsed === undefined) continue;
		const found = [];
		extractTargetFromNode(s.parsed, found);
		for (const { value, isCommand } of found) {
			if (!isCommand) return value;
			const red = value.match(REDIRECT_RE);
			if (red) return red[1];
			const m = value.match(PATH_LIKE_RE);
			if (m) return m[1];
		}
	}
	for (const s of sources) {
		if (s.parsed !== undefined) continue;
		const red = s.text.match(REDIRECT_RE);
		if (red) return red[1];
		const m = s.text.match(PATH_LIKE_RE);
		if (m) return m[1];
	}
	return '';
}

// ---------------------------------------------------------------------------
// 구조 무결성 검사 — "고신뢰 손상 시그니처"만 차단한다 (허위 블록 방지)
// ---------------------------------------------------------------------------

function maskCodeSpans(lines) {
	let inFence = false;
	return lines.map((line) => {
		if (/^\s*(```|~~~)/.test(line)) {
			inFence = !inFence;
			return '·'.repeat(line.length);
		}
		if (inFence) {
			return '·'.repeat(line.length);
		}
		return line.replace(/`[^`\n]*`/g, (m) => '·'.repeat(m.length));
	});
}

const FINDING_CHECKS = [
	{
		id: 'empty_link_text',
		message: '빈 링크 텍스트 [](...) — 링크 문구가 스트리핑되었다',
		run: (lines, masked) => {
			const hits = [];
			masked.forEach((prose, i) => {
				if (/\[\s*\]\(/.test(prose)) hits.push(i + 1);
			});
			return hits;
		},
	},
	{
		id: 'empty_bullet_before_colon',
		message: '빈 불릿 "-  : 본문" — 불릿 라벨(굵은 글씨/링크/인라인 코드)이 스트리핑되었다',
		run: (lines, masked) => {
			const hits = [];
			masked.forEach((line, i) => {
				if (/^[ \t]*[-*+][ \t]+:[ \t]/.test(line)) hits.push(i + 1);
			});
			return hits;
		},
	},
	// 주의: "빈 강조 ** **" 검사는 의도적으로 넣지 않았다. `****` 는 통계 유의도 별표
	// (예: "41.7 ****")와 PII 마스킹("h**@x.com")과 같은 바이트 시퀀스라 오탐이 지배한다.
	{
		id: 'orphan_math_delimiter',
		message: '줄에서 $ 구분자가 홀수 개 — 인라인 수식이 잘렸을 가능성 (가격/변수 표기 의도면 \\$ 로 이스케이프)',
		run: (lines, masked) => {
			// 판정 순서가 중요하다: (1) 코드스팬 제거 → (2) 균형 잡힌 $...$ 쌍 제거 →
			// (3) 전대문자 토큰(NTFS $MFT, 템플릿 $ARGUMENTS, 플레이스홀더 $X)·가격($9/월) 제외 →
			// (4) 잔여 $ 가 홀수면 손상. 토큰 제외를 쌍 제거보다 먼저 하면 정상 수식의
			// 여는 구분자($G, $1)까지 먹혀 오탐이 난다.
			const MATH_PAIR_RE = /\$[^$\n]+\$/g;
			const NON_MATH_TOKEN_RE = /(\$\$?[A-Z][A-Z0-9_]*(?![a-z])|\$\d)/g;
			const hits = [];
			let inFence = false;
			lines.forEach((line, i) => {
				if (/^\s*(```|~~~)/.test(line)) {
					inFence = !inFence;
					return;
				}
				if (inFence) return;
				let prose = line.replace(/`[^`\n]*`/g, '·');
				prose = prose.replace(MATH_PAIR_RE, '·');
				prose = prose.replace(NON_MATH_TOKEN_RE, '·');
				const dollars = (prose.match(/(?<!\\)\$/g) || []).length;
				if (dollars % 2 === 1) hits.push(i + 1);
			});
			return hits;
		},
	},
	{
		id: 'unclosed_code_fence',
		message: '코드펜스(```)가 홀수 개 — 펜스가 닫히지 않았다',
		run: (lines) => {
			let count = 0;
			for (const line of lines) {
				if (/^\s*(```|~~~)/.test(line)) count += 1;
			}
			return count % 2 === 1 ? [lines.length] : [];
		},
	},
	{
		id: 'table_column_mismatch',
		message: '표 열 개수 불일치 — 행에서 셀이 잘려나갔다',
		run: (lines, masked) => {
			const hits = [];
			let block = [];
			const flush = () => {
				if (block.length >= 2) {
					const cellCount = (row) => row.replace(/\\\|/g, '·').split('|').length - 2;
					const header = cellCount(block[0][0]);
					for (let b = 0; b < block.length; b += 1) {
						const [row, lineNo] = block[b];
						if (/^\s*\|?[\s:|-]+\|?\s*$/.test(row)) continue; // 구분자 행(|---|---|)은 무시
						if (cellCount(row) !== header) hits.push(lineNo);
					}
				}
				block = [];
			};
			masked.forEach((line, i) => {
				if (/^\s*\|.*\|\s*$/.test(line)) block.push([line, i + 1]);
				else flush();
			});
			flush();
			return hits;
		},
	},
	{
		id: 'unclosed_evidence_tag',
		message: '미닫힘 <evidence> 또는 <answer> 태그 — Evidence-First Attributed QA 태그 쌍이 맞지 않는다',
		run: (lines, masked) => {
			const maskedText = masked.join('\n');
			const hits = [];
			const openEvidence = (maskedText.match(/<evidence(?:\s+[^>]*)?>/gi) || []).length;
			const closeEvidence = (maskedText.match(/<\/evidence\s*>/gi) || []).length;
			const openAnswer = (maskedText.match(/<answer(?:\s+[^>]*)?>/gi) || []).length;
			const closeAnswer = (maskedText.match(/<\/answer\s*>/gi) || []).length;
			if (openEvidence !== closeEvidence || openAnswer !== closeAnswer) {
				hits.push(lines.length);
			}
			return hits;
		},
	},
	{
		id: 'empty_evidence_block',
		message: '빈 <evidence></evidence> 블록 — 근거 인용 원문이 누락되었다',
		run: (lines, masked) => {
			const full = masked.join('\n');
			const hits = [];
			const re = /<evidence(?:\s+[^>]*)?>\s*<\/evidence\s*>/gi;
			let match;
			while ((match = re.exec(full)) !== null) {
				const lineNo = full.slice(0, match.index).split('\n').length;
				hits.push(lineNo);
			}
			return hits;
		},
	},
	{
		id: 'broken_citation_token',
		message: '깨진 인라인 인용 토큰(【F:...†L...】) 발견 — LangExtract 1:1 바인딩 위반 및 렌더링 손상',
		run: (lines, masked) => {
			const hits = [];
			masked.forEach((line, i) => {
				if (/【F:[^】]+†L\d+[^】]*】/.test(line)) hits.push(i + 1);
			});
			return hits;
		},
	},
];

function scanMarkdown(text) {
	const lines = text.split(/\r?\n/);
	const masked = maskCodeSpans(lines);
	const findings = [];
	for (const check of FINDING_CHECKS) {
		try {
			const hits = check.run(lines, masked);
			if (hits.length > 0) findings.push({ id: check.id, message: check.message, lines: hits.slice(0, 8) });
		} catch {
			// 개별 검사 실패는 전체 게이트를 죽이지 않는다
		}
	}
	return findings;
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

function reportFindings(targetFile, findings) {
	console.error(`[MARKDOWN GUARD v${GUARD_PACK_VERSION}] 구조 무결성 FAIL — "${targetFile}" (PostToolUse 사후 게이트)`);
	for (const f of findings) {
		console.error(`  - [${f.id}] L${f.lines.join(', L')} ${f.message}`);
	}
	console.error('[HINT] 위 줄의 인라인 코드/링크 텍스트/강조/수식이 생성 중 삭제된 것이다. 내용을 복원하거나 문장을 다시 써서 파일을 재작성하라.');
}

async function hookMode() {
	const sources = await collectSources();
	const targetFile = extractTarget(sources);
	if (!targetFile || !/\.md$/i.test(targetFile)) process.exit(0); // .md 만 감시
	if (!fs.existsSync(targetFile)) process.exit(0);
	let text;
	try {
		text = readFileCapped(targetFile);
	} catch {
		process.exit(0); // 읽기 실패는 오탐 방지 — 통과
	}
	const findings = scanMarkdown(text);
	if (findings.length > 0) {
		reportFindings(targetFile, findings);
		process.exit(1);
	}
	process.exit(0);
}

function checkMode(paths) {
	let failed = 0;
	const files = [];
	for (const p of paths) {
		if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
			const walk = (dir) => {
				for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
					if (entry.name === 'node_modules' || entry.name === '.git') continue;
					const full = path.join(dir, entry.name);
					if (entry.isDirectory()) walk(full);
					else if (/\.md$/i.test(entry.name)) files.push(full);
				}
			};
			walk(p);
		} else {
			files.push(p);
		}
	}
	for (const file of files) {
		let text;
		try {
			text = readFileCapped(file);
		} catch {
			continue;
		}
		const findings = scanMarkdown(text);
		if (findings.length > 0) {
			failed += 1;
			reportFindings(file, findings);
		}
	}
	console.error(`[MARKDOWN GUARD v${GUARD_PACK_VERSION}] 검사 ${files.length}개 파일 — FAIL ${failed}개`);
	process.exit(failed > 0 ? 1 : 0);
}

const args = process.argv.slice(2);
if (args[0] === '--check') {
	checkMode(args.slice(1));
} else if (args[0] === '--version') {
	console.log(GUARD_PACK_VERSION);
} else {
	hookMode();
}
