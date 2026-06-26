import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { exists, readJson, root } from "./aggregate-plugin-fixture.mjs";

const mcpPackageManifestPaths = ["../../lsp-tools-mcp/package.json", "../../lsp-daemon/package.json", "../../git-bash-mcp/package.json"];
const mcpPackageManifestExists = await Promise.all(mcpPackageManifestPaths.map(exists));

test("#given aggregate MCP config #when inspected #then code MCPs reference package runtimes without package names", async () => {
	// given
	const packageJson = await readJson("package.json");
	const lspPackageJson = await readJson("components/lsp/package.json");
	const lspDaemonDistPackageJson = await readJson("components/lsp-daemon/dist/package.json");
	const mcp = await readJson(".mcp.json");
	const lspSources = await readdir(join(root, "components", "lsp", "src"));
	const bundledMcpBuildScript = await readFile(join(root, "scripts", "build-bundled-mcp-runtimes.mjs"), "utf8");

	// when
	const lspServer = mcp.mcpServers.lsp;
	const gitBashServer = mcp.mcpServers.git_bash;
	const codeMcpNames = Object.keys(mcp.mcpServers)
		.filter((name) => name === "lsp" || name === "git_bash")
		.sort();
	const componentLocalMcpSources = lspSources.filter((name) => name.startsWith("lazy-mcp") || name === "lazy-lsp-mcp.ts");

	// then
	const isStandalone = packageJson.name === "lazyantigravity";
	assert.deepEqual(codeMcpNames, ["git_bash", "lsp"]);
	assert.equal(packageJson.workspaces.includes("components/lsp/packages/lsp-tools-mcp"), false);
	assert.equal(packageJson.workspaces.includes("components/lsp/packages/lsp-daemon"), false);
	if (isStandalone) {
		assert.deepEqual(packageJson.dependencies, {
			"@code-yeongyu/lsp-daemon": "file:./components/lsp-daemon/dist",
			"@oh-my-opencode/shared-skills": "file:./shared-skills",
		});
	} else {
		assert.deepEqual(packageJson.dependencies, {
			"@code-yeongyu/lsp-daemon": "file:../../lsp-daemon/dist",
			"@oh-my-opencode/shared-skills": "file:../../shared-skills",
		});
	}
	assert.match(bundledMcpBuildScript, /lsp-daemon/);
	assert.match(bundledMcpBuildScript, /git-bash-mcp/);
	assert.equal(lspPackageJson.dependencies?.["@code-yeongyu/lsp-daemon"], "file:../lsp-daemon/dist");
	assert.equal(lspDaemonDistPackageJson.main, "./index.js");
	assert.equal(lspDaemonDistPackageJson.types, "./index.d.ts");
	assert.deepEqual(lspDaemonDistPackageJson.exports?.["."], { types: "./index.d.ts", import: "./index.js" });
	assert.equal(lspDaemonDistPackageJson.exports?.["./dist/cli.js"], "./cli.js");
	assert.doesNotMatch(packageJson.scripts.build, /--workspaces/);
	assert.equal(lspServer.command, "node");
	if (isStandalone) {
		assert.deepEqual(lspServer.args, ["./components/lsp-daemon/dist/cli.js", "mcp"]);
	} else {
		assert.deepEqual(lspServer.args, ["../../lsp-daemon/dist/cli.js", "mcp"]);
	}
	assert.equal(lspServer.cwd, ".");
	assert.equal(gitBashServer.command, "node");
	if (isStandalone) {
		assert.deepEqual(gitBashServer.args, ["./components/git-bash-mcp/dist/cli.js", "mcp"]);
	} else {
		assert.deepEqual(gitBashServer.args, ["../../git-bash-mcp/dist/cli.js", "mcp"]);
	}
	assert.equal(gitBashServer.cwd, ".");
	assert.deepEqual(componentLocalMcpSources, []);
});

test(
	"#given package-level MCP CLIs #when package metadata is inspected #then bin names use the omo prefix",
	{ skip: mcpPackageManifestExists.some((exists) => !exists) },
	async () => {
		// given
		const [lspPackageJson, lspDaemonPackageJson, gitBashPackageJson] = await Promise.all(
			mcpPackageManifestPaths.map((path) => readJson(path)),
		);

		// when
		const binNames = [
			...Object.keys(lspPackageJson.bin ?? {}),
			...Object.keys(lspDaemonPackageJson.bin ?? {}),
			...Object.keys(gitBashPackageJson.bin ?? {}),
		].sort();

		// then
		assert.deepEqual(binNames, ["omo-git-bash", "omo-lsp", "omo-lsp-daemon"]);
		for (const name of binNames) {
			assert.match(name, /^omo-/);
		}
	},
);
