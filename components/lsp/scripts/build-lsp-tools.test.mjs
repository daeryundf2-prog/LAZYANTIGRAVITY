import assert from "node:assert/strict";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const NPM_BODY = `const { appendFileSync } = require("node:fs");\nappendFileSync(process.env.NPM_FAKE_LOG, process.argv.slice(2).join(" ") + "\\n");\n`;

async function makeFixture() {
	const root = await mkdtemp(join(tmpdir(), "codex-lsp-build-"));
	await mkdir(join(root, "packages", "omo-codex", "plugin", "components", "lsp", "scripts"), { recursive: true });
	await mkdir(join(root, "packages", "lsp-tools-mcp", "dist"), { recursive: true });
	await copyFile(
		new URL("./build-lsp-tools.mjs", import.meta.url),
		join(root, "packages", "omo-codex", "plugin", "components", "lsp", "scripts", "build-lsp-tools.mjs"),
	);
	await writeFile(
		join(root, "packages", "lsp-tools-mcp", "package.json"),
		JSON.stringify({ scripts: { build: "tsc -p ." } }) + "\n",
	);
	await writeFile(join(root, "packages", "lsp-tools-mcp", "dist", "cli.js"), "cli\n");
	const fakeBin = join(root, "bin");
	await mkdir(fakeBin, { recursive: true });
	const npmLog = join(root, "npm.log");
	// 로직은 npm.js에 두고, 유닉스용 shebang 실행 파일과 Windows용 .cmd shim이
	// 같은 로직을 호출하게 한다 — execSync("npm ...")는 어떤 플랫폼이든 자기
	// 플랫폼의 실행 파일만 찾는다.
	await writeFile(join(fakeBin, "npm.js"), NPM_BODY);
	await writeFile(join(fakeBin, "npm"), `#!/usr/bin/env node\n${NPM_BODY}`);
	await writeFile(join(fakeBin, "npm.cmd"), `@echo off\r\nnode "%~dp0npm.js" %*\r\n`);
	await chmod(join(fakeBin, "npm"), 0o755);
	return { root, npmLog, script: join(root, "packages", "omo-codex", "plugin", "components", "lsp", "scripts", "build-lsp-tools.mjs"), fakeBin };
}

function runScript(script, fakeBin, args = []) {
	return spawnSync(process.execPath, [script, ...args], {
		encoding: "utf8",
		env: {
			...process.env,
			NPM_FAKE_LOG: join(fakeBin, "..", "npm.log"),
			PATH: `${fakeBin}${delimiter}${process.env.PATH ?? ""}`,
		},
	});
}

test("#given dist cli exists but required hook outputs are missing #when bootstrapping #then it rebuilds", async () => {
	// given
	const fixture = await makeFixture();

	// when
	const result = runScript(fixture.script, fixture.fakeBin);

	// then
	assert.equal(result.status, 0);
	assert.match(await readFile(fixture.npmLog, "utf8"), /ci\nrun build\n/u);
});

test("#given package metadata is newer than required outputs #when bootstrapping #then it rebuilds", async () => {
	// given
	const fixture = await makeFixture();
	await mkdir(join(fixture.root, "packages", "lsp-tools-mcp", "dist", "lsp"), { recursive: true });
	await writeFile(join(fixture.root, "packages", "lsp-tools-mcp", "dist", "lsp", "manager.js"), "manager\n");
	await writeFile(join(fixture.root, "packages", "lsp-tools-mcp", "dist", "tools.js"), "tools\n");
	const older = new Date("2026-01-01T00:00:00.000Z");
	const newer = new Date("2026-01-02T00:00:00.000Z");
	for (const path of [
		join(fixture.root, "packages", "lsp-tools-mcp", "dist", "cli.js"),
		join(fixture.root, "packages", "lsp-tools-mcp", "dist", "tools.js"),
		join(fixture.root, "packages", "lsp-tools-mcp", "dist", "lsp", "manager.js"),
	]) {
		await utimes(path, older, older);
	}
	await utimes(join(fixture.root, "packages", "lsp-tools-mcp", "package.json"), newer, newer);

	// when
	const result = runScript(fixture.script, fixture.fakeBin);

	// then
	assert.equal(result.status, 0);
	assert.match(await readFile(fixture.npmLog, "utf8"), /ci\nrun build\n/u);
});

test("#given force flag #when bootstrapping #then it rebuilds even when dist exists", async () => {
	// given
	const fixture = await makeFixture();
	await mkdir(join(fixture.root, "packages", "lsp-tools-mcp", "dist", "lsp"), { recursive: true });
	await writeFile(join(fixture.root, "packages", "lsp-tools-mcp", "dist", "lsp", "manager.js"), "manager\n");
	await writeFile(join(fixture.root, "packages", "lsp-tools-mcp", "dist", "tools.js"), "tools\n");

	// when
	const result = runScript(fixture.script, fixture.fakeBin, ["--force"]);

	// then
	assert.equal(result.status, 0);
	assert.match(await readFile(fixture.npmLog, "utf8"), /ci\nrun build\n/u);
});

test("#given packaged dist without package metadata #when bootstrapping #then it uses bundled runtime", async () => {
	// given
	const fixture = await makeFixture();
	await mkdir(join(fixture.root, "packages", "lsp-tools-mcp", "dist", "lsp"), { recursive: true });
	await writeFile(join(fixture.root, "packages", "lsp-tools-mcp", "dist", "lsp", "manager.js"), "manager\n");
	await writeFile(join(fixture.root, "packages", "lsp-tools-mcp", "dist", "tools.js"), "tools\n");
	await writeFile(fixture.npmLog, "");
	await rm(join(fixture.root, "packages", "lsp-tools-mcp", "package.json"));

	// when
	const result = runScript(fixture.script, fixture.fakeBin);

	// then
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /Using bundled lsp-tools-mcp dist/);
	assert.equal(await readFile(fixture.npmLog, "utf8"), "");
});
