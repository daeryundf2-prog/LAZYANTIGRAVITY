#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const expected = "327e4eacf0a262e2a5169023fc88c711a1ff0e01683e8150eb19323c9736f91f";
const actual = createHash("sha256").update(readFileSync(join(root, "scripts/toolchain/preserved-baseline-snapshot.mjs"))).digest("hex");
if (actual !== expected) {
	process.stderr.write(`[rebuild.routine.hash] preserved baseline routine hash mismatch: ${actual}\n`);
	process.exit(1);
}
const result = spawnSync(process.execPath, [join(root, "scripts/build-components.mjs")], {
	cwd: root,
	stdio: "inherit",
	windowsHide: true,
});
process.exit(result.status ?? 1);
