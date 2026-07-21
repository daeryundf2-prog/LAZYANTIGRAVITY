#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildChildEnvironment, cleanupIsolatedRoot, prepareIsolatedRoot } from "./live-probes/environment.mjs";
import { loadPublishedRuntime, writeProbeReceipt } from "./live-probes/receipt.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argument = (name, fallback) => {
	const index = process.argv.indexOf(name);
	return index === -1 ? fallback : process.argv[index + 1];
};
const runtimeReceipt = argument("--runtime-receipt", resolve(root, ".omo", "evidence", "task-15-lazyantigravity-antigravity-rebuild.json"));
const receiptPath = argument("--receipt", resolve(root, ".omo", "evidence", "task-16-ide-live-status.json"));
const isolatedRoot = argument("--isolated-root") ?? join(tmpdir(), `lazyantigravity todo16 ide ${randomUUID()}`);
const startedAt = new Date().toISOString();
const { runtime, workspaceFingerprint } = loadPublishedRuntime(runtimeReceipt, { trustedRuntime: process.execPath });
const ownership = prepareIsolatedRoot(isolatedRoot);
try {
	buildChildEnvironment({ isolatedRoot: ownership.root, publishedRuntime: runtime.executable, agyExecutable: null });
} finally {
	cleanupIsolatedRoot(ownership);
}
const receipt = writeProbeReceipt({
	receiptPath,
	subjectRoot: root,
	subjectFiles: [
		"contracts/antigravity/ide-2.0-plugins.md",
		"scripts/live-probes/environment.mjs",
		"scripts/live-probes/receipt.mjs",
		"scripts/probe-antigravity-ide.mjs",
		"test/probe-antigravity-ide.test.mjs",
	],
	surface: "antigravity-ide-2.0-live-probe",
	capability: "pinned-noninteractive-inspection-contract-unavailable",
	workspaceFingerprint,
	publishedRuntime: runtime,
	startedAt,
	status: "unavailable",
	verificationLevel: "contract-tested",
	liveStatus: "unavailable",
	exitCode: 77,
	assertionIds: ["todo16.ide.contract-unavailable", "todo16.ide.no-command-invocation", "todo16.ide.no-private-state-read", "todo16.ide.zero-live-points"],
	command: "no IDE command: pinned noninteractive inspection contract unavailable",
});
process.stdout.write(`${JSON.stringify({ status: receipt.status, liveStatus: receipt.liveStatus, reason: receipt.capability, receipt: receiptPath })}\n`);
process.exitCode = 77;
