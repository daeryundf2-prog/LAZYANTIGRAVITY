#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const pluginRoot = resolve(import.meta.dirname, "..");
const cliPath = `${pluginRoot}/components/ast-index/dist/cli.js`;

const res = spawnSync(process.execPath, [cliPath, ...process.argv.slice(2)], {
	stdio: "inherit",
	cwd: process.cwd(),
});

process.exit(res.status || 0);
