import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const checker = join(root, "scripts", "check-skill-links.mjs");

function runChecker(dir) {
	try {
		const stdout = execFileSync("node", [checker, dir], { encoding: "utf8" });
		return { code: 0, stdout };
	} catch (error) {
		return { code: error.status, stdout: String(error.stdout ?? "") };
	}
}

test("#given the materialized skills tree #when links are checked #then every relative link resolves", () => {
	const { code, stdout } = runChecker(join(root, "skills"));
	assert.equal(code, 0, stdout);
	assert.match(stdout, /all relative links/);
});

test("#given a skill doc linking a missing file #when checked #then it reports the dangling target", () => {
	const dir = mkdtempSync(join(tmpdir(), "skill-links-"));
	writeFileSync(join(dir, "SKILL.md"), "See [manifest](refs-manifest.mjs) and [real](real.md).\n");
	writeFileSync(join(dir, "real.md"), "ok\n");

	const { code, stdout } = runChecker(dir);
	assert.equal(code, 1);
	assert.match(stdout, /dangling: .*SKILL\.md -> refs-manifest\.mjs/);
});

test("#given placeholder links inside prose #when checked #then they are not flagged as files", () => {
	const dir = mkdtempSync(join(tmpdir(), "skill-links-"));
	writeFileSync(
		join(dir, "SKILL.md"),
		"Syntax example: `[label](url)` and `Stream[T](max_buffer_size=N)` are not files.\n" +
			"External: [docs](https://example.com/x.md). Anchor: [up](#section).\n"
	);

	const { code } = runChecker(dir);
	assert.equal(code, 0);
});
