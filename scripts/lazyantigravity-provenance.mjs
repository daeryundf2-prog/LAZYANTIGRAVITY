#!/usr/bin/env node
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { toMarkdown } from "./lazyantigravity-provenance/format.mjs";
import { buildReport } from "./lazyantigravity-provenance/report.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const json = args.includes("--json");
const help = args.includes("--help") || args.includes("-h");
const unknownArgs = args.filter((arg) => !["--json", "--help", "-h"].includes(arg));

if (help) {
	console.log("Usage: node scripts/lazyantigravity-provenance.mjs [--json]");
	process.exit(0);
}

if (unknownArgs.length > 0) {
	console.error(`unknown argument: ${unknownArgs.join(", ")}`);
	process.exit(1);
}

const report = await buildReport(root);

if (json) {
	console.log(JSON.stringify(report, null, 2));
} else {
	console.log(toMarkdown(report));
}
