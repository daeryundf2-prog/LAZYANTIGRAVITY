#!/usr/bin/env node
/**
 * Telemetry component sync hook for the aggregate build.
 * Upstream OMO trees may overwrite component sources here; for the
 * Antigravity-first standalone plugin the component already lives in-tree,
 * so this step is intentionally a no-op identity check.
 */
import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const telemetryCli = join(root, "components", "telemetry", "dist", "cli.js");
const telemetrySrc = join(root, "components", "telemetry", "src");

export async function syncTelemetryComponent() {
	await access(telemetrySrc);
	try {
		await access(telemetryCli);
	} catch {
		console.warn(
			"[sync-telemetry-component] components/telemetry/dist/cli.js missing; run component build next.",
		);
	}
	console.warn("[sync-telemetry-component] Telemetry component already present; sync no-op.");
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entry) {
	syncTelemetryComponent().catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
}
