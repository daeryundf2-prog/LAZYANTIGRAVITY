import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function isolatedDocsCopy() {
	const target = mkdtempSync(join(tmpdir(), "lazyantigravity docs with spaces "));
	for (const path of [
		"CHANGELOG.md", "README.md", "config/antigravity-skills.json", "config/experimental-skill-modes.json",
		"docs/experimental-skills.md", "docs/experimental-skills.ko.md", "scripts/generate-antigravity-docs.mjs",
		"src/README.md", "src/README.ko.md",
	]) cpSync(join(root, path), join(target, path), { recursive: true });
	return target;
}

test("copyable documentation check runs in an isolated path with spaces", () => {
	// Given: an isolated copy containing only documentation inputs and outputs.
	const target = isolatedDocsCopy();
	try {
		// When: the documented check command runs from that copy.
		const result = spawnSync(process.execPath, ["scripts/generate-antigravity-docs.mjs", "--check"], {
			cwd: target, encoding: "utf8", windowsHide: true,
		});
		// Then: deterministic generation succeeds without repository-private state.
		assert.equal(result.status, 0, result.stderr);
	} finally {
		rmSync(target, { recursive: true, force: true });
	}
});

test("unsupported and absolute claim mutations are rejected", () => {
	// Given: isolated copies with one unsupported or absolute claim injected.
	for (const claim of ["All models supported.\n", "This is 100% reliable.\n"]) {
		const target = isolatedDocsCopy();
		try {
			const readme = join(target, "README.md");
			writeFileSync(readme, `${readFileSync(readme, "utf8")}\n${claim}`);
			// When: deterministic check validates the mutated copy.
			const result = spawnSync(process.execPath, ["scripts/generate-antigravity-docs.mjs", "--check"], {
				cwd: target, encoding: "utf8", windowsHide: true,
			});
			// Then: the mutation cannot be accepted as generated documentation.
			assert.notEqual(result.status, 0);
			assert.match(result.stderr, /generated file drift/);
		} finally {
			rmSync(target, { recursive: true, force: true });
		}
	}
});
