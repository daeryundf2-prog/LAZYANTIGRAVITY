import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, relative } from "node:path";
import test from "node:test";

import {
	hookInput,
	inspectStagedPackage,
	isolatedChildEnv,
	safeMcpCall,
} from "../scripts/staged-distribution/contracts.mjs";
import { collectPackageFiles, stageLayouts } from "../scripts/staged-distribution/layout.mjs";

const root = join(import.meta.dirname, "..");
const activeSkills = [
	"ast-grep", "debugging", "frontend-ui-ux", "git-master", "init-deep",
	"lsp", "lsp-setup", "programming", "review-work", "rules", "start-work",
	"ulw", "ulw-loop", "ulw-plan", "visual-qa",
];

test("[todo15.contracts.staged] one Wave A layout exposes only the pinned offline contracts", () => {
	const temp = mkdtempSync(join(tmpdir(), "todo15 staged contracts with spaces "));
	try {
		const manifest = JSON.parse(readFileSync(join(root, "config", "staged-package-files.json"), "utf8"));
		const files = collectPackageFiles(root, manifest);
		const staged = stageLayouts({ snapshotRoot: root, stagingRoot: join(temp, "layouts"), files });
		const layoutRoot = staged.rows[0].root;

		const inspected = inspectStagedPackage(layoutRoot);
		assert.equal(Object.isFrozen(inspected), true);
		assert.deepEqual(inspected.hookIds, ["PreInvocation", "Stop"]);
		assert.deepEqual(inspected.mcpIds, ["database", "git-bash", "lsp"]);
		assert.deepEqual(inspected.activeSkills, activeSkills);
		assert.deepEqual(inspected.experimentalIncluded, []);
		assert.equal(inspected.pluginName, "lazyantigravity");
		assert.equal(inspected.packageName, "lazyantigravity");
		assert.equal(Object.isFrozen(inspected.mcpServers), true);
		for (const server of Object.values(inspected.mcpServers)) {
			assert.equal(server.command, "node");
			assert.equal(server.cwd, ".");
			assert.match(server.args[0], /^\.\//);
			assert.equal(existsSync(join(layoutRoot, server.args[0])), true);
		}

		const artifactRoot = join(temp, "artifacts");
		assert.deepEqual(hookInput("PreInvocation", layoutRoot, artifactRoot), {
			conversationId: "lazyantigravity-staged-validation",
			workspacePaths: [layoutRoot],
			transcriptPath: join(artifactRoot, "transcript.jsonl"),
			artifactDirectoryPath: artifactRoot,
			invocationNum: 1,
			initialNumSteps: 1,
		});
		assert.deepEqual(hookInput("Stop", layoutRoot, artifactRoot), {
			conversationId: "lazyantigravity-staged-validation",
			workspacePaths: [layoutRoot],
			transcriptPath: join(artifactRoot, "transcript.jsonl"),
			artifactDirectoryPath: artifactRoot,
			executionNum: 1,
			terminationReason: "model_stop",
			fullyIdle: true,
		});

		assert.deepEqual(safeMcpCall("git-bash"), { name: "which_bash", arguments: {} });
		assert.deepEqual(safeMcpCall("lsp"), { name: "status", arguments: {} });
		assert.deepEqual(safeMcpCall("database"), { name: "db_list_connections", arguments: {} });

	} finally {
		rmSync(temp, { recursive: true, force: true });
	}
});

test("[todo15.contracts.env] staged children omit ambient capabilities and hostile PATH executables", () => {
	const temp = mkdtempSync(join(tmpdir(), "todo15 staged env with spaces "));
	try {
		const isolationRoot = join(temp, "child state");
		const nodePath = process.execPath;
		const hostileBin = join(temp, "hostile bin");
		const safeBin = join(temp, "safe bin");
		mkdirSync(hostileBin);
		mkdirSync(safeBin);
		const hostileExecutable = join(hostileBin, process.platform === "win32" ? "ambient-hostile.exe" : "ambient-hostile");
		const safeExecutable = join(safeBin, process.platform === "win32" ? "provisioned-tool.exe" : "provisioned-tool");
		copyFileSync(nodePath, hostileExecutable);
		copyFileSync(nodePath, safeExecutable);
		const osEnvironment = Object.fromEntries([
			"SystemRoot", "WINDIR", "ComSpec", "PATHEXT", "LANG", "LC_ALL", "LC_CTYPE",
		].flatMap((key) => typeof process.env[key] === "string" ? [[key, process.env[key]]] : []));
		const env = isolatedChildEnv({
			root: isolationRoot,
			nodePath,
			safeToolPaths: [safeExecutable],
			baseEnv: {
				...osEnvironment,
				PATH: `${hostileBin}${delimiter}${process.env.PATH ?? ""}`,
				SSH_AUTH_SOCK: "must-not-leak",
				GIT_ASKPASS: "must-not-leak",
				NODE_OPTIONS: "--require=hostile-preload.cjs",
				HTTP_PROXY: "http://hostile.invalid",
				HTTPS_PROXY: "http://hostile.invalid",
				ALL_PROXY: "socks5://hostile.invalid",
				npm_config_userconfig: join(temp, "hostile-npmrc"),
				NPM_CONFIG_REGISTRY: "https://hostile.invalid",
				ARBITRARY_PRIVATE_VALUE: "must-not-leak",
			},
		});
		assert.equal(Object.isFrozen(env), true);
		for (const key of [
			"SSH_AUTH_SOCK", "GIT_ASKPASS", "NODE_OPTIONS", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY",
			"npm_config_userconfig", "NPM_CONFIG_REGISTRY", "ARBITRARY_PRIVATE_VALUE",
		]) assert.equal(Object.hasOwn(env, key), false, key);
		assert.deepEqual(env.PATH.split(delimiter), [dirname(nodePath), safeBin]);
		assert.equal(spawnSync("node", ["--version"], { env, encoding: "utf8", shell: false }).status, 0);
		assert.equal(spawnSync("provisioned-tool", ["--version"], { env, encoding: "utf8", shell: false }).status, 0);
		const hostileResolution = spawnSync("ambient-hostile", ["--version"], { env, encoding: "utf8", shell: false });
		assert.notEqual(hostileResolution.status, 0);
		assert.ok(hostileResolution.error, "hostile PATH executable must not resolve");
		for (const key of [
			"HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "TMP", "TEMP", "TMPDIR",
			"XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME",
			"XDG_RUNTIME_DIR", "CODEX_LSP_DAEMON_DIR",
		]) {
			assert.equal(relative(isolationRoot, env[key]).startsWith(".."), false, key);
			assert.equal(existsSync(env[key]), true, key);
		}
	} finally {
		rmSync(temp, { recursive: true, force: true });
	}
});
