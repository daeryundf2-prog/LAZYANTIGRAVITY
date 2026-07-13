import { appendFileSync, chmodSync, closeSync, copyFileSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const fail = (message) => {
	throw new Error(message);
};
const run = (command, args, options = {}) => {
	const result = spawnSync(command, args, {
		cwd: options.cwd,
		encoding: options.encoding,
		input: options.input,
		maxBuffer: 64 * 1024 * 1024,
		windowsHide: true,
	});
	if (result.status !== 0 || result.error) {
		fail(`${command} failed (${result.status ?? "spawn"}): ${String(result.stderr ?? result.error?.message ?? "")}`);
	}
	return result.stdout;
};
const parseArgs = (argv) => {
	const values = new Map();
	for (let index = 0; index < argv.length; index += 2) {
		const key = argv[index];
		const value = argv[index + 1];
		if (!key?.startsWith("--") || value === undefined || values.has(key)) fail("invalid arguments");
		values.set(key, value);
	}
	for (const key of ["--repo", "--evidence", "--validator-node", "--shell-path"]) {
		if (!values.has(key)) fail(`missing ${key}`);
	}
	return values;
};
const within = (root, candidate) => {
	const rel = relative(root, candidate);
	return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
};
const parseNul = (buffer) => {
	if (buffer.length === 0) return [];
	if (buffer[buffer.length - 1] !== 0) fail("git path stream is not NUL terminated");
	return buffer.subarray(0, -1).toString("utf8").split("\0");
};
const versionAtLeast = (actual, required) => {
	const left = actual.replace(/^v/, "").split(".").map(Number);
	const right = required.split(".").map(Number);
	return left[0] > right[0] || (left[0] === right[0] && (left[1] > right[1] || (left[1] === right[1] && left[2] >= right[2])));
};
const contentFingerprint = (records) => {
	const hash = createHash("sha256");
	for (const record of [...records].sort((a, b) => a.path.localeCompare(b.path, "en"))) {
		hash.update(Buffer.from(record.path, "utf8"));
		hash.update(Buffer.from([0]));
		hash.update(Buffer.from(record.sha256, "ascii"));
		hash.update(Buffer.from([0]));
		hash.update(Buffer.from(String(record.size), "ascii"));
		hash.update(Buffer.from([0]));
	}
	return hash.digest("hex");
};
const sanitizePath = (value) => {
	const home = process.env.USERPROFILE;
	return home && value.toLowerCase().startsWith(home.toLowerCase()) ? `<USER_HOME>${value.slice(home.length)}` : value;
};
const inspectWindowsReparse = (paths) => {
	if (process.platform !== "win32") return { method: "lstat", paths: [] };
	const script = "$ErrorActionPreference='Stop';$items=ConvertFrom-Json ([Console]::In.ReadToEnd());$bad=@();foreach($p in $items){$a=(Get-Item -LiteralPath $p -Force).Attributes;if(($a -band [IO.FileAttributes]::ReparsePoint)-ne 0){$bad+=$p}};[Console]::Out.Write((ConvertTo-Json -Compress -InputObject @($bad)))";
	const output = run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", input: JSON.stringify(paths) });
	return { method: "PowerShell FileAttributes.ReparsePoint plus lstat", paths: JSON.parse(output || "[]") };
};
const applyWindowsAcl = (root, access) => {
	if (process.platform !== "win32") {
		chmodSync(root, access === "F" ? 0o700 : 0o500);
		return { method: "chmod", principalHash: null };
	}
	const principal = run("whoami.exe", [], { encoding: "utf8" }).trim();
	run("icacls.exe", [root, "/inheritance:r", "/grant:r", `${principal}:${access}`, "/T", "/C", "/Q"], { encoding: "utf8" });
	run("icacls.exe", [root, "/grant:r", `${principal}:(OI)(CI)${access}`, "/Q"], { encoding: "utf8" });
	return { method: `icacls recursive inheritance:r current-user ${access}`, principalHash: sha256(principal) };
};
const setReadOnlyAttributes = (root) => {
	if (process.platform !== "win32") return;
	const script = "$ErrorActionPreference='Stop';$p=[Console]::In.ReadToEnd();Get-ChildItem -LiteralPath $p -Force -Recurse -File|ForEach-Object{$_.IsReadOnly=$true}";
	run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", input: root });
};

const startedAt = new Date().toISOString();
const args = parseArgs(process.argv.slice(2));
const repoRoot = realpathSync(resolve(args.get("--repo")));
const evidencePath = resolve(args.get("--evidence"));
const expectedEvidencePath = resolve(repoRoot, ".omo/evidence/baseline-snapshot.json");
if (evidencePath !== expectedEvidencePath || !within(repoRoot, evidencePath)) fail("evidence path must be .omo/evidence/baseline-snapshot.json");
const validatorNode = realpathSync(resolve(args.get("--validator-node")));
if (realpathSync(process.execPath) !== validatorNode) fail("validator executable mismatch");
const pathValue = process.env.PATH ?? "";
const pathHashBefore = sha256(pathValue);
const publishedProbeRaw = run("node", ["-e", "process.stdout.write(JSON.stringify({execPath:process.execPath,version:process.version}))"], { encoding: "utf8" });
const publishedProbe = JSON.parse(publishedProbeRaw);
if (!versionAtLeast(process.version, "20.17.0")) fail(`validator Node ${process.version} is below 20.17`);
if (!versionAtLeast(publishedProbe.version, "20.17.0")) fail(`PATH Node ${publishedProbe.version} is below 20.17`);

const git = (...gitArgs) => run("git", gitArgs, { cwd: repoRoot });
const statusBefore = git("status", "--porcelain=v1", "-z");
const trackedNul = git("ls-files", "-z");
const untrackedNul = git("ls-files", "--others", "--exclude-standard", "-z");
const trackedPaths = parseNul(trackedNul);
const untrackedPaths = parseNul(untrackedNul);
const combinedPaths = [...trackedPaths, ...untrackedPaths];
const unique = new Set();
const caseFolded = new Set();
for (const path of combinedPaths) {
	if (!path || path.includes("\\") || path.startsWith("/") || /^[A-Za-z]:/.test(path) || path.startsWith("//")) fail(`invalid path: ${path}`);
	if (posix.normalize(path) !== path || path.split("/").some((part) => !part || part === "." || part === "..")) fail(`non-normal path: ${path}`);
	if (unique.has(path)) fail(`duplicate tracked/untracked path: ${path}`);
	unique.add(path);
	const folded = path.toLocaleLowerCase("en-US");
	if (caseFolded.has(folded)) fail(`case-fold collision: ${path}`);
	caseFolded.add(folded);
}

const sourceRecords = [];
const segmentPaths = new Set([repoRoot]);
for (const path of combinedPaths) {
	const parts = path.split("/");
	let cursor = repoRoot;
	for (let index = 0; index < parts.length; index += 1) {
		cursor = join(cursor, parts[index]);
		if (!within(repoRoot, cursor)) fail(`source escape: ${path}`);
		const info = lstatSync(cursor);
		if (info.isSymbolicLink()) fail(`symlink or junction rejected: ${path}`);
		if (index < parts.length - 1 && !info.isDirectory()) fail(`non-directory source segment: ${path}`);
		if (index === parts.length - 1 && !info.isFile()) fail(`non-regular source rejected: ${path}`);
		segmentPaths.add(cursor);
	}
	const source = resolve(repoRoot, path);
	const canonical = realpathSync(source);
	if (!within(repoRoot, canonical)) fail(`canonical source escape: ${path}`);
	const bytes = readFileSync(source);
	sourceRecords.push({ path, source: trackedPaths.includes(path) ? "tracked" : "untracked", size: bytes.length, sha256: sha256(bytes) });
}
const reparse = inspectWindowsReparse([...segmentPaths]);
if (reparse.paths.length > 0) fail(`reparse paths rejected: ${reparse.paths.length}`);

const nonce = `${Date.now().toString(36)}-${randomBytes(8).toString("hex")}`;
const baselineRoot = resolve(tmpdir(), `lazyantigravity-baseline-${nonce}`);
const subjectRoot = join(baselineRoot, "subject");
const metadataRoot = join(baselineRoot, "_metadata");
mkdirSync(baselineRoot, { mode: 0o700 });
const ownerAcl = applyWindowsAcl(baselineRoot, "F");
mkdirSync(subjectRoot, { mode: 0o700 });
mkdirSync(metadataRoot, { mode: 0o700 });
const routineSourcePath = fileURLToPath(import.meta.url);
const routineSource = readFileSync(routineSourcePath);
const routineSha256 = sha256(routineSource);
copyFileSync(routineSourcePath, join(metadataRoot, "snapshot-routine.mjs"));

try {
	for (const record of sourceRecords) {
		const source = resolve(repoRoot, record.path);
		const destination = resolve(subjectRoot, record.path);
		if (!within(subjectRoot, destination)) fail(`destination escape: ${record.path}`);
		mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
		if (!within(subjectRoot, realpathSync(dirname(destination)))) fail(`canonical destination parent escape: ${record.path}`);
		copyFileSync(source, destination);
		const info = lstatSync(destination);
		if (!info.isFile() || info.isSymbolicLink()) fail(`non-regular destination: ${record.path}`);
		if (!within(subjectRoot, realpathSync(destination))) fail(`canonical destination escape: ${record.path}`);
		const copied = readFileSync(destination);
		if (copied.length !== record.size || sha256(copied) !== record.sha256) fail(`copy hash mismatch: ${record.path}`);
	}
	const inventory = {
		version: 1,
		pathSet: "NUL union: git ls-files -z + git ls-files --others --exclude-standard -z",
		trackedNulSha256: sha256(trackedNul),
		untrackedNulSha256: sha256(untrackedNul),
		unionNulSha256: sha256(Buffer.concat([trackedNul, untrackedNul])),
		subjectFingerprint: contentFingerprint(sourceRecords),
		files: sourceRecords,
	};
	const inventoryBytes = Buffer.from(`${JSON.stringify(inventory, null, 2)}\n`, "utf8");
	writeFileSync(join(metadataRoot, "inventory.json"), inventoryBytes, { flag: "wx", mode: 0o600 });
	setReadOnlyAttributes(baselineRoot);
	const immutableAcl = applyWindowsAcl(baselineRoot, "RX");
	let createCanaryRejected = false;
	try {
		writeFileSync(join(baselineRoot, ".write-canary"), "must fail", { flag: "wx" });
	} catch (error) {
		createCanaryRejected = error?.code === "EACCES" || error?.code === "EPERM";
	}
	let existingFileWriteOpenRejected = false;
	try {
		const descriptor = openSync(resolve(subjectRoot, sourceRecords[0].path), "r+");
		closeSync(descriptor);
	} catch (error) {
		existingFileWriteOpenRejected = error?.code === "EACCES" || error?.code === "EPERM";
	}
	if (!createCanaryRejected || !existingFileWriteOpenRejected) fail("immutable copy canary did not fail");
	const copiedRecords = sourceRecords.map((record) => {
		const bytes = readFileSync(resolve(subjectRoot, record.path));
		return { ...record, size: bytes.length, sha256: sha256(bytes) };
	});
	const copiedFingerprint = contentFingerprint(copiedRecords);
	if (copiedFingerprint !== inventory.subjectFingerprint) fail("post-lock subject fingerprint mismatch");
	if (sha256(readFileSync(join(metadataRoot, "snapshot-routine.mjs"))) !== routineSha256) fail("preserved routine hash mismatch");
	const pathHashAfter = sha256(process.env.PATH ?? "");
	if (pathHashAfter !== pathHashBefore) fail("PATH mutated during snapshot");
	const statusAfter = git("status", "--porcelain=v1", "-z");
	const shellPath = resolve(args.get("--shell-path"));
	const shellVersion = run(shellPath, ["--version"], { encoding: "utf8" }).split(/\r?\n/, 1)[0];
	const head = run("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
	const evidence = {
		schemaVersion: 1,
		task: "pre-change-baseline",
		surface: "repository-subject",
		capability: "immutable-pre-change-snapshot",
		snapshotKind: "baseline",
		status: "passed",
		startedAt,
		finishedAt: new Date().toISOString(),
		exitCode: 0,
		command: "<validator-node> <OS-temp>/snapshot-routine.mjs --repo <repo> --evidence <repo>/.omo/evidence/baseline-snapshot.json --validator-node <validator-node> --shell-path <git-bash>",
		validatorRuntime: { version: process.version, executable: sanitizePath(process.execPath), executableSha256: sha256(process.execPath) },
		publishedRuntime: { version: publishedProbe.version, executable: sanitizePath(publishedProbe.execPath), executableSha256: sha256(publishedProbe.execPath), probe: "literal PATH node" },
		executionEnvironment: {
			platform: process.platform,
			arch: process.arch,
			shell: { kind: "git-bash", executable: sanitizePath(shellPath), version: shellVersion },
			pathSha256: pathHashBefore,
			pathEntryCount: pathValue.split(process.platform === "win32" ? ";" : ":").filter(Boolean).length,
			pathEntriesSanitized: pathValue.split(process.platform === "win32" ? ";" : ":").filter(Boolean).map(sanitizePath),
			pathFrozen: pathHashAfter === pathHashBefore,
		},
		repository: { headInformational: head, statusBeforeSha256: sha256(statusBefore), statusAfterSha256: sha256(statusAfter), productCleanBefore: statusBefore.length === 0, productCleanAfter: statusAfter.length === 0 },
		pathSet: {
			definition: "exact NUL-delimited union of git ls-files -z and git ls-files --others --exclude-standard -z",
			trackedCount: trackedPaths.length,
			untrackedCount: untrackedPaths.length,
			totalCount: combinedPaths.length,
			trackedNulSha256: inventory.trackedNulSha256,
			untrackedNulSha256: inventory.untrackedNulSha256,
			unionNulSha256: inventory.unionNulSha256,
			unique: unique.size === combinedPaths.length,
			caseFoldUnique: caseFolded.size === combinedPaths.length,
			inScope: "all tracked files plus all non-ignored untracked files",
			outOfScope: [".git", ".omo and other ignored paths", "node_modules", "ignored caches", "ignored build state"],
		},
		subjectFiles: sourceRecords.map((record) => record.path).sort((a, b) => a.localeCompare(b, "en")),
		subjectFingerprint: inventory.subjectFingerprint,
		workspaceFingerprint: sha256(Buffer.concat([statusBefore, trackedNul, untrackedNul, Buffer.from(inventory.subjectFingerprint)])),
		artifactHashes: { routineSha256, inventorySha256: sha256(inventoryBytes), preservedRoutineSha256: routineSha256 },
		baseline: { root: baselineRoot, subjectRoot, metadataRoot, retainedUntil: "F4", routineSourceBase64: routineSource.toString("base64") },
		containment: { sourceRootCanonical: repoRoot, destinationRootCanonical: realpathSync(subjectRoot), lstatEverySegment: true, regularFilesOnly: true, reparseCheckMethod: reparse.method, rejectedReparseCount: reparse.paths.length },
		permissions: { ownerOnlyMethod: ownerAcl.method, immutableMethod: immutableAcl.method, principalSha256: immutableAcl.principalHash, readOnlyAttributesApplied: process.platform === "win32", createCanaryRejected, existingFileWriteOpenRejected },
		assertionIds: ["baseline.runtime.validator", "baseline.runtime.published", "baseline.path-frozen", "baseline.path-set-exact", "baseline.paths-contained", "baseline.reparse-rejected", "baseline.copy-byte-identical", "baseline.owner-only", "baseline.immutable", "baseline.product-clean"],
		verification: { sourceFingerprint: inventory.subjectFingerprint, copiedFingerprint, copyMatches: copiedFingerprint === inventory.subjectFingerprint, pathHashBefore, pathHashAfter },
		cleanup: { baselineRetained: true, deleteOnlyAfter: "F4", ephemeralRoutineSource: routineSourcePath },
	};
	mkdirSync(dirname(evidencePath), { recursive: true });
	writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx", mode: 0o600 });
	process.stdout.write(`${JSON.stringify({ evidencePath, baselineRoot, subjectRoot, totalCount: combinedPaths.length, subjectFingerprint: inventory.subjectFingerprint, routineSha256 })}\n`);
} catch (error) {
	try {
		applyWindowsAcl(baselineRoot, "F");
		rmSync(baselineRoot, { recursive: true, force: true });
	} catch {}
	throw error;
}
