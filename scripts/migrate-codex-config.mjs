#!/usr/bin/env node

import { pathToFileURL } from "node:url";

import { MODEL_ROUTING_CAPABILITY } from "./runtime-adapter.mjs";

export async function migrateCodexConfig() {
	return {
		changed: [],
		modelRouting: MODEL_ROUTING_CAPABILITY,
	};
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
	await migrateCodexConfig();
}
