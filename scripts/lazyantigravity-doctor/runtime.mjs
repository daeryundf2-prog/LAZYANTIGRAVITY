import { spawnSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";

import { finishSection } from "./common.mjs";

// Mirrors the bootstrap order in skills/ulw-loop/references/full-workflow.md:
// the skills try `lazyantigravity` first, then fall back to the `omo` alias.
const BINARY_CANDIDATES = ["lazyantigravity", "omo"];

// Capability probes the skills actually rely on. A probe is verified only when
// the resolved binary's output matches `supportedPattern`; a bare `Usage:`
// dump means the binary predates the subcommand (stale shadow install).
const CAPABILITY_PROBES = [
	{
		capability: "ulw-loop research-claims",
		args: ["ulw-loop", "research-claims", "--json"],
		supportedPattern: /Missing --file|claim-ledger/i,
	},
];

// Resolve like a shell would, without depending on `which`/`command -v`
// being reachable (they are not when PATH is minimal, e.g. in tests).
function resolveBinary(name) {
	const exts = process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
	for (const dir of (process.env.PATH ?? "").split(delimiter)) {
		if (dir === "") continue;
		for (const ext of exts) {
			const candidate = join(dir, name + ext);
			try {
				accessSync(candidate, constants.X_OK);
				return candidate;
			} catch {
				// not here — keep scanning
			}
		}
	}
	return null;
}

function probeBinary(binaryPath, probe) {
	const res = spawnSync(binaryPath, probe.args, {
		encoding: "utf8",
		timeout: 15000,
	});
	if (res.error) {
		return { status: "error", detail: String(res.error.message ?? res.error) };
	}
	const output = `${res.stdout ?? ""}${res.stderr ?? ""}`;
	if (probe.supportedPattern.test(output)) {
		return { status: "supported" };
	}
	const hint = /^\s*Usage:/m.test(output)
		? "binary answered with usage fallback (stale build?)"
		: "subcommand output did not match the supported signature (stale build?)";
	return {
		status: "unsupported_subcommand",
		detail: `${hint} first line: ${output.trim().split("\n")[0]?.slice(0, 120) ?? ""}`,
	};
}

export function inspectRuntime(context) {
	const binaries = BINARY_CANDIDATES.map((name) => ({
		name,
		path: resolveBinary(name),
	}));
	const capabilities = CAPABILITY_PROBES.map((probe) => {
		const results = [];
		let selected = null;
		for (const binary of binaries) {
			if (binary.path === null) {
				results.push({ binary: binary.name, resolved: null, status: "absent" });
				continue;
			}
			const probed = probeBinary(binary.path, probe);
			results.push({ binary: binary.name, resolved: binary.path, ...probed });
			if (selected === null && probed.status === "supported") {
				selected = binary.name;
			}
		}
		if (selected === null) {
			const anyInstalled = results.some((r) => r.status !== "absent");
			if (anyInstalled) {
				context.warn(
					"runtime",
					"stale_cli_binary",
					`no PATH-resolved binary supports \`${probe.capability}\`; skills will hit a usage fallback. Install/link a current build (e.g. symlink components/ulw-loop/dist/cli.js) or expect degraded capability.`,
				);
			} else {
				context.warn(
					"runtime",
					"missing_cli_binary",
					`no ${BINARY_CANDIDATES.join("/")} binary on PATH; skills that invoke \`${probe.capability}\` cannot run. Repo dist exists but is not installed.`,
				);
			}
		}
		// A stale fallback next to a supported primary is recorded in `results`
		// but does not degrade the capability — warn only when no binary serves it.
		const { supportedPattern, ...rest } = probe;
		return { ...rest, selected, results };
	});
	return finishSection(context, "runtime", { binaries, capabilities });
}
