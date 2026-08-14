#!/usr/bin/env node
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { syncSkills } from "@lazyantigravity/sync-skills";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

syncSkills(root).catch((err) => {
	console.error(err);
	process.exit(1);
});
