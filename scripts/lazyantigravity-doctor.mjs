#!/usr/bin/env node
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { toText } from "./lazyantigravity-doctor/format.mjs";
import { buildDoctorReport, hasFailures } from "./lazyantigravity-doctor/report.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const json = args.includes("--json");
const help = args.includes("--help") || args.includes("-h");
const unknownArgs = args.filter((arg) => !["--json", "--help", "-h"].includes(arg));

if (help) {
	console.log("Usage: node scripts/lazyantigravity-doctor.mjs [--json]");
	process.exit(0);
}

if (unknownArgs.length > 0) {
	console.error(`unknown argument: ${unknownArgs.join(", ")}`);
	process.exit(1);
}

const report = await buildDoctorReport(root);
if (json) {
	console.log(JSON.stringify(report, null, 2));
} else {
	console.log(toText(report));
}

if (hasFailures(report)) {
	process.exit(1);
}
