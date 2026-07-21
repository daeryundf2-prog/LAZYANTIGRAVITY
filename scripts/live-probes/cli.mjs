import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, normalize, resolve } from "node:path";

import { buildChildEnvironment, cleanupIsolatedRoot, executableKind, findExecutable, prepareIsolatedRoot } from "./environment.mjs";
import { inventoryRoots } from "./inventory.mjs";
import { runBounded } from "./process.mjs";
import { loadPublishedRuntime, writeProbeReceipt } from "./receipt.mjs";

const SUBJECT_FILES = [
	"contracts/antigravity/cli-plugins.md",
	"plugin.json",
	"scripts/live-probes/cli.mjs",
	"scripts/live-probes/environment.mjs",
	"scripts/live-probes/inventory.mjs",
	"scripts/live-probes/process.mjs",
	"scripts/live-probes/receipt.mjs",
	"scripts/smoke-agy-plugin.mjs",
	"test/smoke-agy-plugin.test.mjs",
];

function samePath(left, right) {
	const normalizedLeft = normalize(left);
	const normalizedRight = normalize(right);
	return process.platform === "win32"
		? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
		: normalizedLeft === normalizedRight;
}

async function preflightRuntime(runtime, env, timeoutMs) {
	const resolver = process.platform === "win32"
		? { executable: join(env.SystemRoot, "System32", "where.exe"), args: ["node"] }
		: { executable: "/bin/sh", args: ["-c", "command -v node"] };
	const resolved = await runBounded({ ...resolver, env, timeoutMs });
	if (resolved.status !== "exited" || resolved.exitCode !== 0) throw new Error("published runtime resolver failed");
	const firstResolved = resolved.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
	if (!firstResolved || !samePath(realpathSync(firstResolved), realpathSync(runtime.executable))) {
		throw new Error("resolved child node does not equal recorded publishedRuntime");
	}
	const probed = await runBounded({
		executable: "node",
		args: ["-e", "process.stdout.write(JSON.stringify({version:process.version,executable:process.execPath}))"],
		env,
		timeoutMs,
	});
	if (probed.status !== "exited" || probed.exitCode !== 0) throw new Error("published runtime version probe failed");
	const actual = JSON.parse(probed.stdout);
	if (actual.version !== runtime.version || !samePath(realpathSync(actual.executable), realpathSync(runtime.executable))) {
		throw new Error("published runtime executable/version mismatch");
	}
}

function statusResult(kind, reason) {
	switch (kind) {
		case "unavailable": return { status: "unavailable", liveStatus: "unavailable", verificationLevel: "contract-tested", exitCode: 77, reason };
		case "skipped": return { status: "skipped", liveStatus: "skipped", verificationLevel: "contract-tested", exitCode: 77, reason };
		case "failed": return { status: "failed", liveStatus: "failed", verificationLevel: "contract-tested", exitCode: 1, reason };
		case "passed": return { status: "passed", liveStatus: "passed", verificationLevel: "live-verified", exitCode: 0, reason };
		default: throw new Error(`unknown probe status ${kind}`);
	}
}

function commandOptions(agyExecutable, args, env, timeoutMs) {
	if (process.platform === "win32" && [".bat", ".cmd"].includes(executableKind(agyExecutable))) {
		const command = [agyExecutable, ...args].map((value) => `"${value.replaceAll('"', '""')}"`).join(" ");
		return {
			executable: env.ComSpec,
			args: ["/d", "/s", "/c", `"${command}"`],
			env,
			timeoutMs,
			windowsVerbatimArguments: true,
		};
	}
	return { executable: agyExecutable, args, env, timeoutMs };
}

export async function runCliProbe(options) {
	const startedAt = new Date().toISOString();
	const parentPath = process.env.PATH ?? "";
	const { runtime, workspaceFingerprint } = loadPublishedRuntime(options.runtimeReceipt, {
		trustedRuntime: options.trustedRuntime ?? process.execPath,
	});
	const agyExecutable = options.agyExecutable
		? resolve(options.agyExecutable)
		: findExecutable("agy", parentPath);
	const realRoots = options.realRoots.length > 0
		? options.realRoots.map((root) => resolve(root))
		: [join(homedir(), ".gemini", "antigravity-cli", "plugins")];
	const before = inventoryRoots(realRoots);
	let result = statusResult("failed", "probe-not-completed");
	let assertions = ["todo16.cli.parent-path-frozen", "todo16.cli.real-roots-inventoried"];
	let ownership = null;
	try {
		ownership = prepareIsolatedRoot(options.isolatedRoot);
		const env = buildChildEnvironment({
			isolatedRoot: ownership.root,
			publishedRuntime: runtime.executable,
			agyExecutable,
		});
		await preflightRuntime(runtime, env, options.timeoutMs);
		assertions.push("todo16.cli.published-runtime-realpath-version", "todo16.cli.child-path-sanitized", "todo16.cli.environment-isolated");
		if (!agyExecutable) {
			result = statusResult("unavailable", "agy-binary-missing");
			assertions.push("todo16.cli.binary-unavailable", "todo16.cli.zero-live-points");
		} else if (!options.authProvisioned) {
			result = statusResult("skipped", "auth-deliberately-unprovisioned");
			assertions.push("todo16.cli.auth-unprovisioned", "todo16.cli.zero-live-points");
		} else {
			const install = await runBounded(commandOptions(agyExecutable, ["plugin", "install", resolve(options.pluginRoot)], env, options.timeoutMs));
			let list = null;
			if (install.status === "exited" && install.exitCode === 0) {
				list = await runBounded(commandOptions(agyExecutable, ["plugin", "list"], env, options.timeoutMs));
			}
			const uninstall = await runBounded(commandOptions(agyExecutable, ["plugin", "uninstall", "lazyantigravity"], env, options.timeoutMs));
			const commandPassed = install.status === "exited" && install.exitCode === 0
				&& list?.status === "exited" && list.exitCode === 0 && /(^|\s)lazyantigravity(\s|$)/i.test(list.stdout)
				&& uninstall.status === "exited" && uninstall.exitCode === 0;
			result = commandPassed
				? statusResult("passed", "install-list-uninstall-verified")
				: statusResult("failed", [
					`${install.status}:${install.exitCode}`,
					list ? `${list.status}:${list.exitCode}` : "list-not-run",
					`${uninstall.status}:${uninstall.exitCode}`,
				].join("/"));
			assertions.push(commandPassed ? "todo16.cli.install-list-uninstall" : "todo16.cli.command-failed");
		}
	} catch (error) {
		result = statusResult("failed", error instanceof Error ? error.message : String(error));
		assertions.push("todo16.cli.preflight-or-policy-failed");
	} finally {
		try {
			if (ownership !== null) cleanupIsolatedRoot(ownership);
			assertions.push("todo16.cli.isolated-cleanup");
		} catch {
			result = statusResult("failed", "isolated-cleanup-failed");
			assertions.push("todo16.cli.cleanup-failed");
		}
	}
	const after = inventoryRoots(realRoots);
	if (JSON.stringify(before) !== JSON.stringify(after)) {
		result = statusResult("failed", "real-product-root-changed");
		assertions.push("todo16.cli.real-root-changed");
	} else {
		assertions.push("todo16.cli.real-roots-stable");
	}
	if ((process.env.PATH ?? "") !== parentPath) {
		result = statusResult("failed", "parent-path-mutated");
		assertions.push("todo16.cli.parent-path-mutated");
	}
	const receipt = writeProbeReceipt({
		receiptPath: options.receiptPath,
		subjectRoot: options.subjectRoot,
		subjectFiles: SUBJECT_FILES,
		surface: "antigravity-cli-live-probe",
		capability: result.reason,
		workspaceFingerprint,
		publishedRuntime: runtime,
		startedAt,
		...result,
		assertionIds: [...new Set(assertions)].sort(),
		command: "agy plugin install <local-plugin>; agy plugin list; agy plugin uninstall lazyantigravity",
	});
	return { receipt, reason: result.reason };
}
