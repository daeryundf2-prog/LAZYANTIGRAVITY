#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const expected = process.argv.includes("--expected-routine-sha")
	? process.argv[process.argv.indexOf("--expected-routine-sha") + 1]
	: "327e4eacf0a262e2a5169023fc88c711a1ff0e01683e8150eb19323c9736f91f";
const subjectRoot = process.argv.includes("--subject-root")
	? resolve(process.argv[process.argv.indexOf("--subject-root") + 1])
	: null;
if (!subjectRoot) {
	process.stderr.write("[baseline.args] --subject-root is required\n");
	process.exit(1);
}
const routinePath = join(root, "scripts/toolchain/preserved-baseline-snapshot.mjs");
const actual = createHash("sha256").update(readFileSync(routinePath)).digest("hex");
if (actual !== expected) {
	process.stderr.write(`[baseline.routine.hash] preserved baseline routine hash mismatch: ${actual}\n`);
	process.exit(1);
}
process.stdout.write(`${JSON.stringify({ status: "passed", subjectRoot, routineSha256: actual }, null, 2)}\n`);
