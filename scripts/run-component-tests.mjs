#!/usr/bin/env node
/**
 * Runs the test suite of every component workspace (components/*) and fails
 * when any suite fails. Optional arguments limit the run to named components.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const componentsRoot = join(root, "components");
const only = process.argv.slice(2);

const results = [];
for (const entry of readdirSync(componentsRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
	if (!entry.isDirectory()) continue;
	const packagePath = join(componentsRoot, entry.name, "package.json");
	if (!existsSync(packagePath)) continue;
	const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
	if (!pkg.scripts || typeof pkg.scripts.test !== "string") continue;
	if (only.length > 0 && !only.includes(entry.name)) continue;

	process.stdout.write(`[${entry.name}] running tests...\n`);
	const res = spawnSync("npm", ["run", "--silent", "test"], {
		cwd: join(componentsRoot, entry.name),
		encoding: "utf8",
		shell: process.platform === "win32",
		timeout: 600000,
	});
	const ok = res.status === 0;
	results.push({ name: entry.name, ok });
	if (ok) {
		console.log(`PASS  ${entry.name}`);
	} else {
		console.log(`FAIL  ${entry.name}`);
		if (res.stdout) process.stdout.write(res.stdout + "\n");
		if (res.stderr) process.stderr.write(res.stderr + "\n");
	}
}

const failed = results.filter((r) => !r.ok);
console.log(`\nComponent test suites: ${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) {
	console.error(`Failing components: ${failed.map((r) => r.name).join(", ")}`);
	process.exit(1);
}
