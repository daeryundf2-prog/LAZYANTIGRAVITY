import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const awtGuardScript = join(root, "scripts", "awt-guard.mjs");

test("#given normal tool payload #when awt-guard executes #then returns AWT Contract", () => {
	// given
	const payload = JSON.stringify({ tool_name: "view_file", tool_input: { AbsolutePath: "/path/file.ts" } });

	// when
	const output = execSync(`node "${awtGuardScript}"`, {
		input: payload,
		encoding: "utf8",
	});
	const parsed = JSON.parse(output.trim());

	// then
	assert.match(parsed.additionalContext, /LazyAntigravity AWT Contract/);
	assert.doesNotMatch(parsed.additionalContext, /METANARRATIVE ABORT/);
});

test("#given metacognitive excuse payload with 흥미롭군요 #when awt-guard executes #then returns METANARRATIVE ABORT", () => {
	// given
	const payload = JSON.stringify({ message: "흥미롭군요. 왜 에러가 났는지 살펴봅시다." });

	// when
	const output = execSync(`node "${awtGuardScript}"`, {
		input: payload,
		encoding: "utf8",
	});
	const parsed = JSON.parse(output.trim());

	// then
	assert.match(parsed.additionalContext, /METANARRATIVE ABORT/);
	assert.match(parsed.additionalContext, /흥미롭군요/);
});

test("#given metacognitive excuse payload with That's interesting #when awt-guard executes #then returns METANARRATIVE ABORT", () => {
	// given
	const payload = JSON.stringify({ message: "That's interesting, let me think why that happened." });

	// when
	const output = execSync(`node "${awtGuardScript}"`, {
		input: payload,
		encoding: "utf8",
	});
	const parsed = JSON.parse(output.trim());

	// then
	assert.match(parsed.additionalContext, /METANARRATIVE ABORT/);
});

test("#given capability claim 'immediately usable' #when awt-guard executes #then returns CLAIM EVIDENCE advisory", () => {
	// given
	const payload = JSON.stringify({ message: "The keyword is registered and immediately usable now." });

	// when
	const output = execSync(`node "${awtGuardScript}"`, {
		input: payload,
		encoding: "utf8",
	});
	const parsed = JSON.parse(output.trim());

	// then
	assert.match(parsed.additionalContext, /CLAIM EVIDENCE/);
	assert.match(parsed.additionalContext, /registered/);
});

test("#given capability claim '즉시 사용 가능' #when awt-guard executes #then returns CLAIM EVIDENCE advisory", () => {
	// given
	const payload = JSON.stringify({ message: "스킬이 등록되어 즉시 사용 가능합니다." });

	// when
	const output = execSync(`node "${awtGuardScript}"`, {
		input: payload,
		encoding: "utf8",
	});
	const parsed = JSON.parse(output.trim());

	// then
	assert.match(parsed.additionalContext, /CLAIM EVIDENCE/);
});

test("#given capability claim '완벽히 동일' #when awt-guard executes #then returns CLAIM EVIDENCE advisory", () => {
	// given
	const payload = JSON.stringify({ message: "두 파이프라인은 완벽히 동일한 기능을 제공합니다." });

	// when
	const output = execSync(`node "${awtGuardScript}"`, {
		input: payload,
		encoding: "utf8",
	});
	const parsed = JSON.parse(output.trim());

	// then
	assert.match(parsed.additionalContext, /CLAIM EVIDENCE/);
});

test("#given plain status payload without capability claims #when awt-guard executes #then no CLAIM EVIDENCE advisory", () => {
	// given
	const payload = JSON.stringify({ message: "registered the keyword row; running the subcommand next." });

	// when
	const output = execSync(`node "${awtGuardScript}"`, {
		input: payload,
		encoding: "utf8",
	});
	const parsed = JSON.parse(output.trim());

	// then
	assert.doesNotMatch(parsed.additionalContext, /CLAIM EVIDENCE/);
});
