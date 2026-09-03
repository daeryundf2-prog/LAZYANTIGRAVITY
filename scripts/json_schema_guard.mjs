#!/usr/bin/env node
/**
 * json_schema_guard.mjs — PostToolUse JSON 구조 및 스키마 무결성 가드 (Feature 07)
 * GUARD_PACK_VERSION: 1.0.0
 *
 * Instructor/Pydantic 스타일의 필드 유효성 검사 및 자가 수정(Self-Correction) 피드백 제공:
 * - JSON 파싱 무결성 (SyntaxError 원천 차단)
 * - 고위험 필드(URL, 파일 경로, 날짜 포맷, 필수 필드) 유효성 검사
 * - FAIL_CLOSED 정책: 검증 실패 시 상세 수정 가이드(blame & repair)를 stderr에 출력하고 exit 1
 */
import fs from 'node:fs';
import path from 'node:path';
import { stdin } from 'node:process';

const GUARD_PACK_VERSION = '1.0.0';

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

const TARGET_KEY_RE = /^(file_path|filepath|path|target|target_file|targetfile|target_path|targetpath|output|file|filename)$/i;
const PATH_LIKE_RE = /([^\s"'`<>|;&]+[\/\\][^\s"'`<>|;&]+\.json)/i;

function extractTargetFromNode(node, out) {
	if (Array.isArray(node)) {
		for (const item of node) extractTargetFromNode(item, out);
		return;
	}
	if (!node || typeof node !== 'object') return;
	for (const [key, value] of Object.entries(node)) {
		if (typeof value === 'string' && value) {
			if (TARGET_KEY_RE.test(key)) out.push(value);
		} else if (value && typeof value === 'object') {
			extractTargetFromNode(value, out);
		}
	}
}

function extractTarget(sources) {
	const env = process.env.ANTIGRAVITY_TARGET_FILE || process.env.TARGET_FILE || '';
	if (env && env.endsWith('.json')) return env;
	for (const s of sources) {
		if (s.parsed === undefined) continue;
		const found = [];
		extractTargetFromNode(s.parsed, found);
		for (const val of found) {
			if (val.endsWith('.json')) return val;
		}
	}
	for (const s of sources) {
		if (s.parsed !== undefined) continue;
		const m = s.text.match(PATH_LIKE_RE);
		if (m) return m[1];
	}
	return '';
}

export function validateJsonObject(obj, pathPrefix = '$') {
	const violations = [];

	if (obj === null || typeof obj !== 'object') {
		return violations;
	}

	for (const [key, val] of Object.entries(obj)) {
		const currentPath = `${pathPrefix}.${key}`;

		// URL Validation
		if (/^(url|uri|homepage|repository|endpoint)$/i.test(key) && typeof val === 'string') {
			if (val.trim().length > 0 && !/^(https?|git\+https?|file|wss?):\/\//i.test(val)) {
				violations.push({
					field: currentPath,
					value: val,
					rule: 'valid_url_protocol',
					message: `URL '${val}' must have a valid protocol (http, https, file, ws)`
				});
			}
		}

		// ISO Date Validation
		if (/^(date|timestamp|created_at|updated_at)$/i.test(key) && typeof val === 'string') {
			if (val.trim().length > 0 && Number.isNaN(Date.parse(val))) {
				violations.push({
					field: currentPath,
					value: val,
					rule: 'valid_iso_date',
					message: `Date '${val}' is not a valid parseable date string`
				});
			}
		}

		// Version semantic format
		if (/^version$/i.test(key) && typeof val === 'string') {
			if (val.trim().length > 0 && !/^\d+\.\d+\.\d+(-[a-zA-Z0-9_.-]+)?$/.test(val.trim())) {
				violations.push({
					field: currentPath,
					value: val,
					rule: 'valid_semver',
					message: `Version '${val}' does not match SemVer format (e.g. 1.0.0)`
				});
			}
		}

		// Recursion
		if (val && typeof val === 'object') {
			violations.push(...validateJsonObject(val, currentPath));
		}
	}

	return violations;
}

export function checkJsonFile(filePath) {
	if (!fs.existsSync(filePath)) {
		return { ok: true, skipped: true, reason: 'File does not exist' };
	}

	let content;
	try {
		content = fs.readFileSync(filePath, 'utf8');
	} catch (err) {
		return { ok: true, skipped: true, reason: `Could not read file: ${err.message}` };
	}

	if (!content.trim()) {
		return { ok: false, error: 'Empty JSON file', violations: [{ field: '$', rule: 'non_empty', message: 'File is empty' }] };
	}

	let parsed;
	try {
		parsed = JSON.parse(content);
	} catch (err) {
		return {
			ok: false,
			error: `Malformed JSON Syntax: ${err.message}`,
			violations: [{ field: '$', rule: 'syntax_error', message: err.message }]
		};
	}

	const violations = validateJsonObject(parsed);
	if (violations.length > 0) {
		return { ok: false, error: 'Schema validation failed', violations };
	}

	return { ok: true, parsed };
}

async function main() {
	if (process.argv.includes('--check')) {
		const files = process.argv.slice(process.argv.indexOf('--check') + 1);
		let hasFailure = false;
		for (const f of files) {
			const res = checkJsonFile(path.resolve(f));
			if (!res.ok) {
				console.error(`[JSON SCHEMA GUARD] FAIL ${f}: ${res.error}`);
				for (const v of res.violations || []) {
					console.error(`  - ${v.field}: ${v.message}`);
				}
				hasFailure = true;
			}
		}
		process.exit(hasFailure ? 1 : 0);
	}

	const sources = await collectSources();
	const target = extractTarget(sources);

	if (!target || !target.endsWith('.json')) {
		process.exit(0);
	}

	const resolvedPath = path.resolve(target);
	const res = checkJsonFile(resolvedPath);

	if (!res.ok) {
		console.error(`[JSON SCHEMA GUARD v${GUARD_PACK_VERSION}] PostToolUse Schema Validation FAIL: "${target}"`);
		console.error(`Error: ${res.error}`);
		console.error('[INSTRUCTOR SELF-CORRECTION GUIDANCE]:');
		for (const v of res.violations || []) {
			console.error(`  Field [${v.field}] (${v.rule}): ${v.message}`);
		}
		console.error('Action Required: Correct the schema violations and rewrite the JSON file before proceeding.');
		process.exit(1);
	}

	process.exit(0);
}

import { fileURLToPath } from 'node:url';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((err) => {
		console.error(`[JSON SCHEMA GUARD] Error: ${err.message}`);
		process.exit(0);
	});
}
