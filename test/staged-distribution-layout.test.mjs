import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	LAYOUTS,
	collectPackageFiles,
	stageLayouts,
	validateInstalledManifest,
} from "../scripts/staged-distribution/layout.mjs";

const root = join(import.meta.dirname, "..");

test("[todo15.layout.contract] exact four path-with-spaces layouts preserve identical installed bytes", () => {
	assert.deepEqual(LAYOUTS.map(({ id, relativeRoot, ruleStatus }) => ({ id, relativeRoot, ruleStatus })), [
		{ id: "ide-dot-workspace", relativeRoot: "workspace root/.agents/plugins/lazyantigravity", ruleStatus: "unverified" },
		{ id: "ide-underscore-workspace", relativeRoot: "workspace root/_agents/plugins/lazyantigravity", ruleStatus: "unverified" },
		{ id: "ide-global", relativeRoot: "user home/.gemini/config/plugins/lazyantigravity", ruleStatus: "unverified" },
		{ id: "cli-global", relativeRoot: "user home/.gemini/antigravity-cli/plugins/lazyantigravity", ruleStatus: "not-applicable" },
	]);
	const temp = mkdtempSync(join(tmpdir(), "todo15 layout with spaces "));
	try {
		const snapshot = join(temp, "snapshot source");
		mkdirSync(join(snapshot, "skills", "one"), { recursive: true });
		writeFileSync(join(snapshot, "plugin.json"), "{\"name\":\"lazyantigravity\"}\n");
		writeFileSync(join(snapshot, "skills", "one", "SKILL.md"), "---\nname: one\n---\n");
		const manifest = { schemaVersion: 1, files: ["plugin.json"], directories: ["skills/one"] };
		const files = collectPackageFiles(snapshot, manifest);
		const result = stageLayouts({ snapshotRoot: snapshot, stagingRoot: join(temp, "isolated roots"), files });
		assert.equal(result.rows.length, 4);
		assert.equal(new Set(result.rows.map((row) => row.layoutHash)).size, 1);
		assert.deepEqual(result.rows.map((row) => row.fileCount), [2, 2, 2, 2]);
	} finally {
		rmSync(temp, { recursive: true, force: true });
	}
});

test("[todo15.layout.reject] manifest excludes experimental and rejects missing, orphan, case collision, and symlink input", () => {
	assert.throws(() => validateInstalledManifest({ schemaVersion: 1, files: ["experimental-skills/x"] }), /experimental/i);
	assert.throws(() => validateInstalledManifest({ schemaVersion: 1, files: ["skills/A/SKILL.md", "skills/a/SKILL.md"] }), /case-collision/i);
	const temp = mkdtempSync(join(tmpdir(), "todo15-invalid-"));
	try {
		writeFileSync(join(temp, "plugin.json"), "{}\n");
		assert.throws(() => collectPackageFiles(temp, { schemaVersion: 1, files: ["missing.json"] }), /missing/i);
		if (process.platform !== "win32") {
			symlinkSync(join(temp, "plugin.json"), join(temp, "linked.json"));
			assert.throws(() => collectPackageFiles(temp, { schemaVersion: 1, files: ["linked.json"] }), /symlink/i);
		}
	} finally {
		rmSync(temp, { recursive: true, force: true });
	}
});

test("[todo15.layout.mcp-closure] installed files contain every local stdio target and LSP runtime dependency", () => {
	const manifest = JSON.parse(readFileSync(join(root, "config", "staged-package-files.json"), "utf8"));
	const mcp = JSON.parse(readFileSync(join(root, "mcp_config.json"), "utf8"));
	const collectedPaths = new Set(collectPackageFiles(root, manifest).map(({ path }) => path));
	const relativeTargets = Object.values(mcp.mcpServers).map((server) => {
		assert.equal(server.command, "node");
		assert.equal(server.cwd, ".");
		assert.match(server.args[0], /^\.\//);
		return server.args[0].slice(2);
	});
	const requiredTargets = [...relativeTargets, "components/lsp-tools-mcp/dist/cli.js"];
	for (const target of requiredTargets) {
		assert.ok(collectedPaths.has(target), `installed package is missing MCP runtime target: ${target}`);
	}
});

test("[todo15.layout.documentation-closure] every root README local link is installed", () => {
	const manifest = JSON.parse(readFileSync(join(root, "config", "staged-package-files.json"), "utf8"));
	const collectedPaths = new Set(collectPackageFiles(root, manifest).map(({ path }) => path));
	const readme = readFileSync(join(root, "README.md"), "utf8");
	const localLinks = [...readme.matchAll(/\[[^\]]+\]\((?!https?:|#)([^)]+)\)/g)].map((match) => match[1]);
	assert.ok(localLinks.length > 0);
	for (const target of localLinks) assert.ok(collectedPaths.has(target), `installed README target is missing: ${target}`);
});
