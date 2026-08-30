#!/usr/bin/env node
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

// vitest는 Windows에서 .cmd shim이라 shell 없이 스폰하면 EINVAL로 실패한다.
const vitest = spawnSync("vitest", ["--run", ...process.argv.slice(2)], { stdio: "inherit", shell: process.platform === "win32" });
if (vitest.status !== 0) process.exit(vitest.status ?? 1);

// Enumerate explicitly: node 20's --test does not glob path arguments.
const scriptTests = readdirSync("scripts")
	.filter((name) => name.endsWith(".test.mjs"))
	.map((name) => join("scripts", name));
const nodeTest = spawnSync(process.execPath, ["--test", ...scriptTests], { stdio: "inherit" });
process.exit(nodeTest.status ?? 1);
