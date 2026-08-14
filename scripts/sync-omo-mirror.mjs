#!/usr/bin/env node
/**
 * Optional sync: copy selected built artifacts from components/* into plugins/omo/*
 * so the legacy mirror does not silently drift for critical paths.
 *
 * Usage: node scripts/sync-omo-mirror.mjs
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const copies = [
	["components/ulw-loop/dist/cli.js", "plugins/omo/components/ulw-loop/dist/cli.js"],
	["components/ulw-loop/dist/dry-run.js", "plugins/omo/components/ulw-loop/dist/dry-run.js"],
	["components/ulw-loop/dist/role-checkpoint.js", "plugins/omo/components/ulw-loop/dist/role-checkpoint.js"],
	["components/ulw-loop/dist/lsp-rules-feedback.js", "plugins/omo/components/ulw-loop/dist/lsp-rules-feedback.js"],
	["components/start-work-continuation/dist/boulder-reader.js", "plugins/omo/components/start-work-continuation/dist/boulder-reader.js"],
	["components/telemetry/dist/product-identity.js", "plugins/omo/components/telemetry/dist/product-identity.js"],
	["components/telemetry/dist/data-path.js", "plugins/omo/components/telemetry/dist/data-path.js"],
];

let copied = 0;
for (const [fromRel, toRel] of copies) {
	const from = join(root, fromRel);
	const to = join(root, toRel);
	if (!existsSync(from)) {
		console.warn(`skip missing source: ${fromRel}`);
		continue;
	}
	mkdirSync(dirname(to), { recursive: true });
	copyFileSync(from, to);
	copied += 1;
	console.log(`synced ${fromRel} -> ${toRel}`);
}
console.log(`sync-omo-mirror: ${copied}/${copies.length} files`);
