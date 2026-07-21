#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const BASELINE_ROUTINE_SHA256 = "327e4eacf0a262e2a5169023fc88c711a1ff0e01683e8150eb19323c9736f91f";

function fail(code, message) {
	process.stderr.write(`[${code}] ${message}\n`);
	process.exit(1);
}

function readJson(path) {
	return JSON.parse(readFileSync(join(root, path), "utf8"));
}

const packageJson = readJson("package.json");
for (const key of ["workspaces", "dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
	if (packageJson[key] !== undefined) fail("root.package.dependencies", `root package must omit ${key}`);
}
const expectedScripts = {
	check: "node scripts/validate-root-toolchain.mjs",
	"rebuild:maintainer": "node scripts/rebuild-components.mjs",
	"sync:skills": "node scripts/sync-skills.mjs",
	test: "node scripts/run-tests.mjs",
	"validate:distribution": "node scripts/validate-antigravity-distribution.mjs",
};
if (JSON.stringify(packageJson.scripts) !== JSON.stringify(expectedScripts)) {
	fail("root.package.scripts", "root package scripts drifted from Todo 5 contract");
}

const baselineBytes = readFileSync(join(root, "scripts/toolchain/preserved-baseline-snapshot.mjs"));
if (baselineBytes.length !== 15680 || sha256(baselineBytes) !== BASELINE_ROUTINE_SHA256) {
	fail("root.baseline.routine", `preserved baseline routine drifted: ${baselineBytes.length} ${sha256(baselineBytes)}`);
}
const baselineReceiptPath = join(root, ".omo/evidence/baseline-snapshot.json");
if (existsSync(baselineReceiptPath)) {
	const baselineReceipt = JSON.parse(readFileSync(baselineReceiptPath, "utf8"));
	if (baselineReceipt.baseline.routineSourceBase64 !== baselineBytes.toString("base64")) {
		fail("root.baseline.receipt", "preserved baseline routine does not match baseline receipt");
	}
}

const schema = readJson("config/evidence.schema.json");
if (schema.additionalProperties !== false) fail("root.evidence.schema", "schema must be closed");
const rubric = readJson("config/score-rubric.json");
const points = rubric.categories.flatMap((category) => category.items).reduce((sum, item) => sum + item.points, 0);
if (points !== 100 || rubric.awardRule !== "fresh-passed-receipt-only") fail("root.rubric", "rubric must be exact 100-point all-or-zero contract");

process.stdout.write(`${JSON.stringify({
	status: "passed",
	assertionIds: ["root.package-dependency-free", "root.baseline-routine-preserved", "root.evidence-schema", "root.score-rubric"],
	baselineRoutine: { bytes: baselineBytes.length, sha256: BASELINE_ROUTINE_SHA256 },
}, null, 2)}\n`);
