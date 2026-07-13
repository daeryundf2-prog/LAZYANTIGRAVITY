import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function sameCanonicalPath(left, right) {
	return process.platform === "win32"
		? left.toLowerCase() === right.toLowerCase()
		: left === right;
}

function trustedRuntime(executable) {
	const canonical = realpathSync(executable);
	const current = realpathSync(process.execPath);
	if (!sameCanonicalPath(canonical, current)) {
		throw new Error("trusted runtime must be the current process executable");
	}
	return Object.freeze({ executable: canonical, version: process.version });
}

export function loadPublishedRuntime(receiptPath, options = {}) {
	const source = JSON.parse(readFileSync(receiptPath, "utf8"));
	const published = source.publishedRuntime;
	const validator = source.validatorRuntime;
	if (!published || typeof published.executable !== "string" || typeof published.version !== "string") {
		throw new Error("runtime receipt has no recorded publishedRuntime executable/version");
	}
	if (!validator || typeof validator.executable !== "string" || typeof validator.version !== "string") {
		throw new Error("runtime receipt has no recorded validatorRuntime executable/version");
	}
	if (!/^[a-f0-9]{64}$/i.test(source.workspaceFingerprint ?? "")) {
		throw new Error("runtime receipt has no valid workspace fingerprint evidence");
	}
	const runtime = trustedRuntime(options.trustedRuntime ?? process.execPath);
	const publishedPath = realpathSync(published.executable);
	const validatorPath = realpathSync(validator.executable);
	if (!sameCanonicalPath(publishedPath, runtime.executable)
		|| !sameCanonicalPath(validatorPath, runtime.executable)
		|| published.version !== runtime.version
		|| validator.version !== runtime.version) {
		throw new Error("receipt runtime does not match the current trusted runtime");
	}
	return { runtime, workspaceFingerprint: source.workspaceFingerprint };
}

export function writeProbeReceipt(options) {
	const subjectFiles = [...options.subjectFiles].sort();
	const artifactHashes = Object.fromEntries(subjectFiles.map((path) => [path, sha256(readFileSync(join(options.subjectRoot, path)))]));
	const subjectFingerprint = sha256(JSON.stringify(subjectFiles.map((path) => [path, artifactHashes[path]])));
	const receipt = {
		task: "16",
		surface: options.surface,
		capability: options.capability,
		snapshotKind: "final",
		subjectFiles,
		subjectFingerprint,
		workspaceFingerprint: options.workspaceFingerprint,
		status: options.status,
		verificationLevel: options.verificationLevel,
		liveStatus: options.liveStatus,
		command: options.command,
		validatorRuntime: { version: process.version, executable: realpathSync(process.execPath) },
		publishedRuntime: options.publishedRuntime,
		os: { platform: process.platform, arch: process.arch },
		startedAt: options.startedAt,
		finishedAt: new Date().toISOString(),
		exitCode: options.exitCode,
		assertionIds: options.assertionIds,
		artifactHashes,
	};
	mkdirSync(dirname(options.receiptPath), { recursive: true });
	writeFileSync(options.receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
	return receipt;
}
