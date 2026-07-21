import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	lstatSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import { canonicalJson, persistBundle, verifyBundle } from "./bundle.mjs";
import {
	hookInput,
	inspectStagedPackage,
	isolatedChildEnv,
	safeMcpCall,
} from "./contracts.mjs";
import { collectPackageFiles, stageLayouts } from "./layout.mjs";
import {
	SUPPORTED_MCP_PROTOCOL_VERSIONS,
	runHookProcess,
	runMcpLifecycle,
} from "./processes.mjs";

const HOOK_IDS = Object.freeze(["PreInvocation", "Stop"]);
const MCP_IDS = Object.freeze(["database", "git-bash", "lsp"]);

export async function validateStagedDistribution({ subjectRoot, artifactRoot, nodePath }) {
	const subject = requireDirectory(subjectRoot, "subjectRoot");
	const bundleRoot = requireAbsolutePath(artifactRoot, "artifactRoot");
	const runtime = requireFile(nodePath, "nodePath");
	requireEmptyOrMissingDirectory(bundleRoot);

	const runtimeRoot = mkdtempSync(join(tmpdir(), "todo15 validator runtime with spaces "));
	const receipts = [];
	let daemonOwners = [];
	let report;
	let failure;
	try {
		const manifest = readManifest(subject);
		const files = collectPackageFiles(subject, manifest);
		const staged = stageLayouts({
			snapshotRoot: subject,
			stagingRoot: join(runtimeRoot, "four staged layouts with spaces"),
			files,
		});
		const contracts = [];
		const hookRecords = [];
		const mcpRecords = [];

		for (const layout of staged.rows) {
			const inspected = inspectStagedPackage(layout.root);
			assertExactContract(inspected);
			contracts.push(contractRecord(layout, inspected));
			const rowRoot = join(runtimeRoot, "isolated child state", layout.id);
			const env = isolatedChildEnv({ root: rowRoot, nodePath: runtime });
			const hookArtifacts = join(rowRoot, "hook artifacts");
			mkdirSync(hookArtifacts, { recursive: true });

			for (const event of inspected.hookIds) {
				const baseInput = hookInput(event, layout.root, hookArtifacts);
				let input = baseInput;
				if (event === "Stop") {
					const stopWorkspace = join(rowRoot, "stop workspace");
					const boulderRoot = join(stopWorkspace, ".omo");
					mkdirSync(boulderRoot, { recursive: true });
					writeFileSync(join(boulderRoot, "boulder.json"), `${JSON.stringify({
						active_work_id: "inactive",
						works: { inactive: { active_plan: "plan.md", session_ids: [], status: "complete" } },
					})}\n`, { flag: "wx" });
					input = Object.freeze({ ...baseInput, workspacePaths: Object.freeze([stopWorkspace]) });
				}
				const result = await runHookProcess({
						nodePath: runtime,
						hookPath: join(layout.root, "scripts", "antigravity-hook.mjs"),
						event,
						input: `${JSON.stringify(input)}\n`,
						cwd: layout.root,
						env,
					});
				receipts.push(result.receipt);
				hookRecords.push(Object.freeze({
					event,
					layoutId: layout.id,
					output: result.output,
					receipt: result.receipt,
				}));
			}

			for (const serverId of inspected.mcpIds) {
				const server = inspected.mcpServers[serverId];
				for (const protocolVersion of SUPPORTED_MCP_PROTOCOL_VERSIONS) {
					const result = await runMcpLifecycle({
						nodePath: runtime,
						serverPath: resolve(layout.root, server.args[0]),
						args: server.args.slice(1),
						cwd: layout.root,
						env,
						protocolVersion,
						safeCall: safeMcpCall(serverId),
					});
					receipts.push(result.receipt);
					mcpRecords.push(Object.freeze({
						layoutId: layout.id,
						negotiatedProtocolVersion: result.protocolVersion,
						protocolVersion,
						receipt: result.receipt,
						safeCall: safeMcpCall(serverId).name,
						serverId,
						toolCount: result.toolsList.result.tools.length,
						toolError: result.toolCall?.result?.isError === true,
					}));
				}
			}
		}

		assertIdenticalLayouts(staged.rows);
		const logicalFiles = files.map((file) => Object.freeze({ bytes: file.size, path: file.path, sha256: file.sha256 }));
		const subjectFingerprint = files.manifestHash;
		const layoutHashes = Object.fromEntries(staged.rows.map(({ id, layoutHash }) => [id, layoutHash]));
		const logicalFingerprint = sha256(canonicalJson({ layoutHashes, logicalFiles }));
		const reconstruction = {
			layoutHashes,
			logicalFiles,
			logicalFingerprint,
			schemaVersion: 1,
			subjectFingerprint,
		};
		assertReconstruction(reconstruction, staged.canonicalManifest);
		const mutations = exerciseBundleMutations(runtimeRoot, reconstruction, subjectFingerprint, logicalFingerprint);
		daemonOwners = discoverOwnedDaemons(runtimeRoot, runtime);
		const cleanup = Object.freeze({ orphanCount: 0, ownedChildCount: receipts.length + daemonOwners.length, runtimeRootRemoved: true });
		const artifacts = {
			"cleanup.json": cleanup,
			"contracts/layouts.json": contracts,
			"hooks/processes.json": hookRecords,
			"mcp/processes.json": mcpRecords,
			"mutations.json": mutations,
			"package/manifest.json": { files: logicalFiles, schemaVersion: 1, subjectFingerprint },
			"reconstruction.json": reconstruction,
			"skills/catalog.json": {
				activeSkills: contracts[0].activeSkills,
				experimentalIncluded: [],
				schemaVersion: 1,
			},
		};
		const persisted = persistBundle({
			bundleDir: bundleRoot,
			artifacts,
			metadata: { logicalFingerprint, subjectFingerprint },
		});
		const verified = verifyBundle(bundleRoot);
		if (verified.bundleHash !== persisted.bundleHash) throw new Error("persisted bundle hash did not verify");

		const layouts = staged.rows.map(({ id, relativeRoot, ruleStatus, fileCount, layoutHash }) =>
			Object.freeze({ id, relativeRoot, ruleStatus, fileCount, layoutHash }));
		report = {
			activeSkillCount: contracts[0].activeSkills.length,
			activeSkills: contracts[0].activeSkills,
			bundle: Object.freeze({
				hash: verified.bundleHash,
				logicalFingerprint,
				reconstructionValid: true,
				subjectFingerprint,
				verified: true,
			}),
			cleanup,
			experimentalIncluded: Object.freeze([]),
			hookIds: HOOK_IDS,
			layouts: Object.freeze(layouts),
			mcpIds: MCP_IDS,
			orphanCount: 0,
			status: "passed",
		};
	} catch (error) {
		failure = boundedError(error);
	} finally {
		try {
			if (daemonOwners.length === 0) daemonOwners = discoverOwnedDaemons(runtimeRoot, runtime);
			await terminateOwnedDaemons(daemonOwners);
		} catch (error) {
			failure ??= boundedError(error);
		}
		try {
			rmSync(runtimeRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
		} catch (error) {
			failure ??= boundedError(error);
		}
		if (existsSync(runtimeRoot)) failure ??= new Error("[staged-distribution] runtime cleanup failed");
	}

	const orphanCount = countIncompleteProcessCleanups(receipts)
		+ daemonOwners.filter((owner) => ownedDaemonStillRunning(owner)).length;
	if (orphanCount !== 0) failure ??= new Error(`[staged-distribution] ${orphanCount} owned child processes remain`);
	if (failure !== undefined) throw failure;
	return Object.freeze(report);
}

export function countIncompleteProcessCleanups(receipts) {
	return receipts.filter((receipt) => receipt?.cleanup?.exited !== true).length;
}

function readManifest(subjectRoot) {
	const path = join(subjectRoot, "config", "staged-package-files.json");
	return JSON.parse(readFileSync(path, "utf8"));
}

function assertExactContract(contract) {
	if (canonicalJson(contract.hookIds) !== canonicalJson(HOOK_IDS)
		|| canonicalJson(contract.mcpIds) !== canonicalJson(MCP_IDS)
		|| contract.activeSkills.length !== 15
		|| contract.experimentalIncluded.length !== 0) {
		throw new Error("staged package contract differs from the pinned distribution");
	}
}

function contractRecord(layout, inspected) {
	return Object.freeze({
		activeSkills: inspected.activeSkills,
		experimentalIncluded: inspected.experimentalIncluded,
		hookIds: inspected.hookIds,
		layoutId: layout.id,
		mcpIds: inspected.mcpIds,
		packageName: inspected.packageName,
		pluginName: inspected.pluginName,
		schemaVersion: 1,
	});
}

function assertIdenticalLayouts(rows) {
	if (rows.length !== 4 || new Set(rows.map(({ layoutHash }) => layoutHash)).size !== 1
		|| new Set(rows.map(({ fileCount }) => fileCount)).size !== 1) {
		throw new Error("the four staged layouts are not byte-identical");
	}
}

function assertReconstruction(record, canonicalManifest) {
	const rebuilt = `${JSON.stringify(record.logicalFiles.map(({ path, sha256: hash, bytes }) => ({ path, sha256: hash, size: bytes })))}\n`;
	if (rebuilt !== canonicalManifest || Object.values(record.layoutHashes).some((hash) => hash !== sha256(rebuilt))) {
		throw new Error("layout reconstruction did not reproduce the staged hashes");
	}
}

function exerciseBundleMutations(runtimeRoot, reconstruction, subjectFingerprint, logicalFingerprint) {
	const malformed = join(runtimeRoot, "mutation malformed bundle");
	mkdirSync(malformed);
	writeFileSync(join(malformed, "bundle-manifest.json"), "{\n");
	writeFileSync(join(malformed, "bundle.sha256"), `${"0".repeat(64)}\n`);
	const malformedResult = expectedBundleFailure("malformed-bundle", () => verifyBundle(malformed));
	const altered = join(runtimeRoot, "mutation altered bundle");
	persistBundle({ bundleDir: altered, artifacts: { "reconstruction.json": reconstruction }, metadata: { logicalFingerprint, subjectFingerprint } });
	writeFileSync(join(altered, "reconstruction.json"), "{}\n");
	const alteredResult = expectedBundleFailure("altered-bundle", () => verifyBundle(altered));
	return Object.freeze([malformedResult, alteredResult]);
}

function expectedBundleFailure(id, operation) {
	try {
		operation();
	} catch (error) {
		return Object.freeze({
			expectedFailure: true,
			id,
			message: boundedMessage(error),
			observedFailure: true,
			schemaVersion: 1,
		});
	}
	throw new Error(`${id} mutation unexpectedly verified`);
}

function requireAbsolutePath(value, label) {
	if (typeof value !== "string" || value.length === 0 || !isAbsolute(value)) throw new TypeError(`${label} must be an absolute path`);
	return resolve(value);
}

function requireDirectory(value, label) {
	const path = requireAbsolutePath(value, label);
	if (!existsSync(path) || !lstatSync(path).isDirectory()) throw new TypeError(`${label} must be an existing directory`);
	return path;
}

function requireFile(value, label) {
	const path = requireAbsolutePath(value, label);
	if (!existsSync(path) || !lstatSync(path).isFile()) throw new TypeError(`${label} must be an existing file`);
	return path;
}

function requireEmptyOrMissingDirectory(path) {
	if (!existsSync(path)) return;
	const stat = lstatSync(path);
	if (stat.isSymbolicLink() || !stat.isDirectory() || readdirSync(path).length !== 0) {
		throw new Error("artifactRoot must not exist or must be an empty non-symlink directory");
	}
}

function discoverOwnedDaemons(runtimeRoot, nodePath) {
	if (!existsSync(runtimeRoot)) return [];
	const pidFiles = [];
	const walk = (directory) => {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) walk(path);
			else if (entry.isFile() && entry.name === "daemon.pid") pidFiles.push(path);
		}
	};
	walk(runtimeRoot);
	const owners = [];
	for (const pidFile of pidFiles) {
		const pid = Number.parseInt(readFileSync(pidFile, "utf8").trim(), 10);
		if (!Number.isInteger(pid) || pid <= 0 || owners.some((owner) => owner.pid === pid)) continue;
		const identity = readProcessIdentity(pid);
		const commandLineVerified = typeof identity?.commandLine === "string"
			&& identity.commandLine.includes(runtimeRoot)
			&& /[\\/]components[\\/]lsp-daemon[\\/]dist[\\/]cli\.js"?\s+daemon\s*$/i.test(identity.commandLine);
		const windowsFallbackVerified = process.platform === "win32" && identity?.commandLine === null;
		if (identity === null
			|| resolve(identity.executable).toLowerCase() !== resolve(nodePath).toLowerCase()
			|| typeof identity.created !== "string" || identity.created.length === 0
			|| (!commandLineVerified && !windowsFallbackVerified)) {
			throw new Error(`refusing to terminate unverified LSP daemon pid ${pid}`);
		}
		owners.push(Object.freeze({
			pid,
			commandLine: identity.commandLine,
			created: identity.created,
			executable: resolve(identity.executable).toLowerCase(),
		}));
	}
	return Object.freeze(owners);
}

function readProcessIdentity(pid) {
	if (process.platform === "win32") {
		const command = `$p=Get-CimInstance Win32_Process -Filter \"ProcessId = ${pid}\";if($null-ne $p){[pscustomobject]@{executable=[string]$p.ExecutablePath;commandLine=[string]$p.CommandLine;created=$p.CreationDate.ToUniversalTime().ToString('o')}|ConvertTo-Json -Compress}`;
		const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
			encoding: "utf8", shell: false, windowsHide: true, timeout: 2_000,
		});
		if (result.status !== 0 || result.stdout.trim() === "") {
			const fallbackCommand = `$p=Get-Process -Id ${pid} -ErrorAction SilentlyContinue;if($null-ne $p){[pscustomobject]@{executable=[string]$p.Path;commandLine=$null;created=$p.StartTime.ToUniversalTime().ToString('o')}|ConvertTo-Json -Compress}`;
			const fallback = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", fallbackCommand], {
				encoding: "utf8", shell: false, windowsHide: true, timeout: 2_000,
			});
			if (fallback.status !== 0 || fallback.stdout.trim() === "") return null;
			try {
				const value = JSON.parse(fallback.stdout);
				return { commandLine: value.commandLine, created: value.created, executable: value.executable };
			} catch { return null; }
		}
		try {
			const value = JSON.parse(result.stdout);
			return { commandLine: value.commandLine, created: value.created, executable: value.executable };
		} catch { return null; }
	}
	const command = spawnSync("ps", ["-ww", "-p", String(pid), "-o", "lstart=", "-o", "command="], { encoding: "utf8", shell: false });
	if (command.status !== 0 || command.stdout.trim() === "") return null;
	const match = /^(\S+\s+\S+\s+\d+\s+\d+:\d+:\d+\s+\d+)\s+(.+)$/.exec(command.stdout.trim());
	if (match === null) return null;
	return { commandLine: match[2], created: match[1], executable: nodePathFromCommand(match[2]) };
}

function nodePathFromCommand(commandLine) {
	const first = /^"([^"]+)"|^(\S+)/.exec(commandLine);
	return first?.[1] ?? first?.[2] ?? "";
}

export async function terminateOwnedDaemons(owners, {
	platform = process.platform,
	processKill = process.kill,
	readIdentity = readProcessIdentity,
	taskkill = runTaskkill,
	wait = (milliseconds) => new Promise((complete) => setTimeout(complete, milliseconds)),
} = {}) {
	for (const owner of owners) {
		const { pid } = owner;
		if (!assertDaemonIdentity(owner, readIdentity)) continue;
		try { processKill(pid, "SIGTERM"); } catch (error) { if (error?.code !== "ESRCH") throw error; }
		let state = "running";
		for (let attempt = 0; attempt < 40; attempt += 1) {
			await wait(50);
			state = daemonIdentityState(owner, readIdentity(pid));
			if (state === "mismatch") throw new Error(`refusing to terminate unverified LSP daemon pid ${pid}`);
			if (state === "absent") break;
		}
		if (state === "absent") continue;
		if (!assertDaemonIdentity(owner, readIdentity)) continue;
		if (platform !== "win32") processKill(pid, "SIGKILL");
		else {
			const killed = taskkill(pid);
			if (killed.status !== 0 && daemonIdentityState(owner, readIdentity(pid)) === "running") {
				throw new Error(`failed to terminate owned LSP daemon pid ${pid}`);
			}
		}
	}
}

function ownedDaemonStillRunning(owner) {
	return daemonIdentityState(owner, readProcessIdentity(owner.pid)) === "running";
}

function assertDaemonIdentity(owner, readIdentity) {
	const state = daemonIdentityState(owner, readIdentity(owner.pid));
	if (state === "mismatch") throw new Error(`refusing to terminate unverified LSP daemon pid ${owner.pid}`);
	return state === "running";
}

function daemonIdentityState(owner, identity) {
	if (identity === null) return "absent";
	return resolve(identity.executable).toLowerCase() === owner.executable
		&& identity.commandLine === owner.commandLine
		&& identity.created === owner.created
		? "running" : "mismatch";
}

function runTaskkill(pid) {
	return spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
		encoding: "utf8", shell: false, windowsHide: true,
	});
}

function boundedMessage(error) {
	const message = error instanceof Error ? error.message : String(error);
	return message.replace(/[\r\n]+/g, " ").slice(0, 512) || "unknown failure";
}

function boundedError(error) {
	return new Error(`[staged-distribution] ${boundedMessage(error)}`, { cause: error instanceof Error ? error : undefined });
}

function sha256(value) {
	return createHash("sha256").update(value).digest("hex");
}
