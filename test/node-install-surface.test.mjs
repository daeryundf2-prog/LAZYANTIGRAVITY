import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = join(pluginRoot, "src");

async function exists(path) {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

test("#given install docs that exist #when inspected #then they stay Bun-free for lazycodex references", async () => {
	const candidates = [
		join(repoRoot, "README.md"),
		join(repoRoot, "docs", "guide", "installation.md"),
		join(repoRoot, "packages", "omo-codex", "README.md"),
		join(repoRoot, "packages", "omo-codex", "MARKETPLACE.md"),
		join(pluginRoot, "components", "ultrawork", "README.md"),
		join(pluginRoot, "components", "ulw-loop", "README.md"),
	];

	const files = [];
	for (const path of candidates) {
		if (await exists(path)) files.push(path);
	}

	assert.ok(files.length > 0, "expected at least one install doc surface");

	const docs = await Promise.all(files.map(async (path) => [path, await readFile(path, "utf8")]));
	for (const [path, text] of docs) {
		if (!/lazycodex/i.test(text)) continue;
		assert.match(text, /\bnpx lazycodex-ai install\b/, `${path} should document the Node/npm install command`);
		const oldRunnerPattern = new RegExp(`\\b${["bu", "nx"].join("")} lazycodex-ai\\b`);
		assert.doesNotMatch(text, oldRunnerPattern, `${path} should not require Bun for lazycodex`);
	}
});
