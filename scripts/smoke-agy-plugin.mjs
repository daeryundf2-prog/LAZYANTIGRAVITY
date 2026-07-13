#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runCliProbe } from "./live-probes/cli.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function values(name) {
	const found = [];
	for (let index = 2; index < process.argv.length; index += 1) {
		if (process.argv[index] === name && process.argv[index + 1]) found.push(process.argv[index + 1]);
	}
	return found;
}

function value(name, fallback = null) {
	return values(name).at(-1) ?? fallback;
}

const runtimeReceipt = value("--runtime-receipt", resolve(root, ".omo", "evidence", "task-15-lazyantigravity-antigravity-rebuild.json"));
const receiptPath = value("--receipt", resolve(root, ".omo", "evidence", "task-16-cli-live-status.json"));
const isolatedRoot = value("--isolated-root") ?? join(tmpdir(), `lazyantigravity todo16 cli ${randomUUID()}`);
const timeoutMs = Number.parseInt(value("--timeout-ms", "10000"), 10);
const outcome = await runCliProbe({
	runtimeReceipt,
	receiptPath,
	isolatedRoot,
	pluginRoot: value("--plugin-root", root),
	agyExecutable: value("--agy"),
	authProvisioned: process.argv.includes("--auth-provisioned"),
	realRoots: values("--real-root"),
	timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10_000,
	subjectRoot: root,
});
process.stdout.write(`${JSON.stringify({ status: outcome.receipt.status, liveStatus: outcome.receipt.liveStatus, reason: outcome.reason, receipt: receiptPath })}\n`);
process.exitCode = outcome.receipt.exitCode;
