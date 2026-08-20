#!/usr/bin/env node
import { spawnSync } from "node:child_process";

console.log("[verify-dist-sync] Verifying source-to-dist compilation reproducibility...");

const buildRes = spawnSync("npm", ["run", "build"], { stdio: "inherit" });
if (buildRes.status !== 0) {
	console.error("[verify-dist-sync] Build failed during reproducibility check.");
	process.exit(1);
}

const diffRes = spawnSync("git", ["diff", "--name-only", "--", "components/*/dist", "plugins/omo/components/*/dist"], {
	encoding: "utf8",
});

if (diffRes.stdout && diffRes.stdout.trim().length > 0) {
	console.error("[verify-dist-sync] Found uncommitted or out-of-sync dist build artifacts:");
	console.error(diffRes.stdout.trim());
	console.error("[verify-dist-sync] Please run 'npm run build' and stage all dist artifacts.");
	process.exit(1);
}

console.log("[verify-dist-sync] All dist outputs match compiled TypeScript sources 100%.");
process.exit(0);
