import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, posix, resolve, sep } from "node:path";

export const MAX_ARTIFACT_BYTES = 1_048_576, MAX_BUNDLE_BYTES = 16_777_216;

const MAX_ARTIFACTS = 2_048, CONTROL_FILES = new Set(["bundle-manifest.json", "bundle.sha256"]);
const SHA256 = /^[a-f0-9]{64}$/, ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SENSITIVE_KEY = /(?:auth(?:orization)?|cookie|credential|passw(?:or)?d|secret|token|api[-_]?key|private[-_]?key)/i, ROW_KEY = /^(?:db[-_]?rows?|query[-_]?rows?|rows?|records)$/i, WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

export function canonicalJson(value) {
	const seen = new Set();
	function visit(current, depth) {
		if (depth > 64) throw new TypeError("canonical JSON exceeds maximum depth");
		if (current === null || typeof current === "string" || typeof current === "boolean") return current;
		if (typeof current === "number") {
			if (!Number.isFinite(current)) throw new TypeError("canonical JSON requires finite numbers");
			return Object.is(current, -0) ? 0 : current;
		}
		if (typeof current !== "object") throw new TypeError("canonical JSON contains an unsupported value");
		if (seen.has(current)) throw new TypeError("canonical JSON contains a cycle");
		seen.add(current);
		try {
			if (Array.isArray(current)) {
				if (Object.keys(current).some((key, index) => key !== String(index)) || Object.keys(current).length !== current.length) throw new TypeError("canonical JSON arrays must be dense");
				return current.map((item) => visit(item, depth + 1));
			}
			const prototype = Object.getPrototypeOf(current);
			if (prototype !== Object.prototype && prototype !== null) throw new TypeError("canonical JSON requires plain objects");
			return Object.fromEntries(Object.keys(current).sort(compareText).map((key) => [key, visit(current[key], depth + 1)]));
		} finally { seen.delete(current); }
	}
	return JSON.stringify(visit(value, 0));
}

export function persistBundle({ bundleDir, artifacts, metadata }) {
	const root = prepareEmptyRoot(bundleDir);
	const entries = normalizeEntries(artifacts);
	const cleanArtifacts = {};
	let totalBytes = 0;
	for (const [artifactPath, value] of entries) {
		const bytes = artifactBytes(artifactPath, value);
		totalBytes += bytes.length;
		if (bytes.length > MAX_ARTIFACT_BYTES) throw new Error(`artifact bytes exceed limit: ${artifactPath}`);
		if (totalBytes > MAX_BUNDLE_BYTES) throw new Error("bundle artifact bytes exceed limit");
		const target = resolveInside(root, artifactPath);
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, bytes, { flag: "wx" });
		if (!lstatSync(target).isFile()) throw new Error(`artifact is not a regular file: ${artifactPath}`);
		cleanArtifacts[artifactPath] = { bytes: bytes.length, sha256: sha256(bytes) };
	}
	const cleanMetadata = validateMetadata(metadata);
	const manifest = { artifacts: cleanArtifacts, bundleVersion: 1,
		createdAt: cleanMetadata.createdAt ?? new Date().toISOString(),
		logicalFingerprint: cleanMetadata.logicalFingerprint, subjectFingerprint: cleanMetadata.subjectFingerprint };
	validateManifest(manifest);
	const manifestBytes = Buffer.from(canonicalJson(manifest));
	writeFileSync(resolve(root, "bundle-manifest.json"), manifestBytes, { flag: "wx" });
	const bundleHash = sha256(manifestBytes);
	writeFileSync(resolve(root, "bundle.sha256"), `${bundleHash}\n`, { flag: "wx" });
	return { bundleHash, manifest };
}

export function verifyBundle(bundleDir) {
	const root = requireSafeRoot(bundleDir);
	const inventory = scanBundle(root);
	for (const control of CONTROL_FILES) if (!inventory.files.has(control)) throw new Error(`missing bundle control file: ${control}`);
	const manifestBytes = readFileSync(resolve(root, "bundle-manifest.json"));
	if (manifestBytes.length > MAX_ARTIFACT_BYTES) throw new Error("bundle manifest exceeds byte limit");
	let manifest;
	try {
		manifest = JSON.parse(decodeUtf8(manifestBytes));
	} catch (error) {
		throw new Error(`bundle manifest schema/JSON error: ${error.message}`);
	}
	validateManifest(manifest);
	if (canonicalJson(manifest) !== decodeUtf8(manifestBytes)) throw new Error("bundle manifest is not canonical JSON");
	const expectedArtifacts = Object.keys(manifest.artifacts);
	const expectedFiles = new Set([...expectedArtifacts, ...CONTROL_FILES]);
	for (const artifactPath of expectedArtifacts) if (!inventory.files.has(artifactPath)) throw new Error(`missing artifact: ${artifactPath}`);
	for (const actualPath of inventory.files) if (!expectedFiles.has(actualPath)) throw new Error(`extra artifact: ${actualPath}`);
	const expectedDirectories = parentDirectories(expectedArtifacts);
	for (const actualPath of inventory.directories) if (!expectedDirectories.has(actualPath)) throw new Error(`extra artifact directory: ${actualPath}`);
	let totalBytes = 0;
	for (const artifactPath of expectedArtifacts) {
		const bytes = readFileSync(resolveInside(root, artifactPath));
		totalBytes += bytes.length;
		const expected = manifest.artifacts[artifactPath];
		if (bytes.length !== expected.bytes) throw new Error(`artifact hash/size mismatch: ${artifactPath}`);
		if (sha256(bytes) !== expected.sha256) throw new Error(`artifact hash mismatch: ${artifactPath}`);
		verifySanitizedArtifact(artifactPath, bytes);
	}
	if (totalBytes > MAX_BUNDLE_BYTES) throw new Error("bundle artifact bytes exceed limit");
	const bundleHash = sha256(manifestBytes);
	const recordedHash = decodeUtf8(readFileSync(resolve(root, "bundle.sha256")));
	if (recordedHash !== `${bundleHash}\n`) throw new Error("bundle hash mismatch");
	return { bundleHash, manifest };
}

function compareText(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

function decodeUtf8(bytes) { try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
	catch { throw new Error("artifact is not valid UTF-8"); } }

function sanitizeText(text) {
	return text
		.replace(/\b(authorization|proxy-authorization|cookie|set-cookie)\s*[:=]\s*[^\r\n,;]+/gi, "$1=<REDACTED_AUTH>")
		.replace(/\b(password|passwd|secret|token|api[-_]?key|client[-_]?secret)\b\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1=<REDACTED_CREDENTIAL>")
		.replace(/\b(?:sk|gh[pousr]|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{8,}\b/g, "<REDACTED_TOKEN>")
		.replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "<REDACTED_TOKEN>")
		.replace(/(?:[A-Za-z]:[\\/])Users[\\/][^\\/\s"']+[\\/]AppData[\\/]Local[\\/]Temp[\\/][^\s"']*/gi, "<TEMP_PATH>")
		.replace(/\/(?:var\/)?tmp\/[^\s"']*/g, "<TEMP_PATH>")
		.replace(/(?:[A-Za-z]:[\\/])Users[\\/][^\\/\s"']+/gi, "<USER_PATH>")
		.replace(/\/(?:home|Users)\/[^/\s"']+/g, "<USER_PATH>")
		.replace(/(?:[A-Za-z]:[\\/]|\/)[^\r\n"']*[\\/](?:stage|staging|todo15)[^\s"']*/gi, "<STAGE_PATH>");
}

function sanitizeValue(value, key = "", depth = 0) {
	if (depth > 64) throw new TypeError("artifact JSON exceeds maximum depth");
	if (SENSITIVE_KEY.test(key)) return "<REDACTED_CREDENTIAL>";
	if (ROW_KEY.test(key)) return "<REDACTED_DB_ROWS>";
	if (typeof value === "string") return sanitizeText(value);
	if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, "", depth + 1));
	if (value !== null && typeof value === "object") return Object.fromEntries(Object.keys(value).map((name) => [name, sanitizeValue(value[name], name, depth + 1)]));
	return value;
}

function artifactBytes(artifactPath, value) {
	let text;
	if (typeof value === "string") text = value;
	else if (Buffer.isBuffer(value) || value instanceof Uint8Array) text = decodeUtf8(value);
	else return Buffer.from(canonicalJson(sanitizeValue(value)));
	if (artifactPath.endsWith(".json")) {
		try { return Buffer.from(canonicalJson(sanitizeValue(JSON.parse(text)))); }
		catch (error) { throw new Error(`artifact JSON is invalid (${artifactPath}): ${error.message}`); }
	}
	if (artifactPath.endsWith(".ndjson")) {
		const lines = text.trim().length === 0 ? [] : text.trimEnd().split(/\r?\n/);
		try { return Buffer.from(lines.map((line) => canonicalJson(sanitizeValue(JSON.parse(line)))).join("\n") + (lines.length > 0 ? "\n" : "")); }
		catch (error) { throw new Error(`artifact NDJSON is invalid (${artifactPath}): ${error.message}`); }
	}
	return Buffer.from(sanitizeText(text));
}

function normalizeEntries(artifacts) {
	let entries;
	if (Array.isArray(artifacts)) entries = artifacts;
	else if (artifacts instanceof Map) entries = [...artifacts.entries()]; else if (isPlainObject(artifacts)) entries = Object.entries(artifacts);
	else throw new TypeError("artifacts must be a plain object, Map, or entry array");
	if (entries.length > MAX_ARTIFACTS) throw new Error("artifact count exceeds limit");
	const exact = new Set();
	const folded = new Set();
	return entries.map((entry) => {
		if (!Array.isArray(entry) || entry.length !== 2) throw new TypeError("artifact entries must be [path, value] pairs");
		const artifactPath = validateArtifactPath(entry[0]);
		if (exact.has(artifactPath)) throw new Error(`duplicate artifact path: ${artifactPath}`);
		const foldedPath = artifactPath.toLowerCase();
		if (folded.has(foldedPath)) throw new Error(`artifact path case-collision: ${artifactPath}`);
		exact.add(artifactPath);
		folded.add(foldedPath);
		return [artifactPath, entry[1]];
	}).sort(([left], [right]) => compareText(left, right));
}

function validateArtifactPath(value) {
	if (typeof value !== "string" || value.length === 0 || value.length > 512) throw new Error("unsafe artifact path"); if (value.includes("\\") || value.includes("\0") || value.startsWith("/") || value.startsWith("//") || /^[A-Za-z]:/.test(value)) throw new Error(`unsafe artifact path: ${value}`);
	const parts = value.split("/");
	if (posix.normalize(value) !== value || parts.some((part) => part === "" || part === "." || part === ".." || part.length > 255 || /[\x00-\x1f:]/.test(part) || WINDOWS_RESERVED.test(part))) throw new Error(`unsafe artifact path: ${value}`);
	if (CONTROL_FILES.has(value)) throw new Error(`reserved artifact path: ${value}`);
	return value;
}

function validateMetadata(metadata) {
	if (!isPlainObject(metadata)) throw new TypeError("bundle metadata must be a plain object");
	assertExactKeys(metadata, ["createdAt", "logicalFingerprint", "subjectFingerprint"], ["logicalFingerprint", "subjectFingerprint"], "bundle metadata");
	if (!SHA256.test(metadata.subjectFingerprint) || !SHA256.test(metadata.logicalFingerprint)) throw new Error("bundle metadata fingerprint schema violation"); if (metadata.createdAt !== undefined && !ISO_DATE.test(metadata.createdAt)) throw new Error("bundle metadata createdAt schema violation");
	return metadata; }

function validateManifest(manifest) {
	if (!isPlainObject(manifest)) throw new Error("bundle manifest schema violation");
	assertExactKeys(manifest, ["artifacts", "bundleVersion", "createdAt", "logicalFingerprint", "subjectFingerprint"], ["artifacts", "bundleVersion", "createdAt", "logicalFingerprint", "subjectFingerprint"], "bundle manifest");
	if (manifest.bundleVersion !== 1 || !ISO_DATE.test(manifest.createdAt) || !SHA256.test(manifest.subjectFingerprint) || !SHA256.test(manifest.logicalFingerprint) || !isPlainObject(manifest.artifacts)) throw new Error("bundle manifest schema violation");
	const entries = normalizeEntries(manifest.artifacts);
	for (const [artifactPath] of entries) {
		const record = manifest.artifacts[artifactPath];
		if (!isPlainObject(record)) throw new Error(`artifact manifest schema violation: ${artifactPath}`);
		assertExactKeys(record, ["bytes", "sha256"], ["bytes", "sha256"], "artifact manifest record");
		if (!Number.isSafeInteger(record.bytes) || record.bytes < 0 || record.bytes > MAX_ARTIFACT_BYTES || !SHA256.test(record.sha256)) throw new Error(`artifact manifest schema violation: ${artifactPath}`);
	}
}

function verifySanitizedArtifact(artifactPath, bytes) {
	const text = decodeUtf8(bytes);
	if (artifactPath.endsWith(".json")) {
		let value;
		try {
			value = JSON.parse(text);
		} catch (error) {
			throw new Error(`artifact schema/JSON error (${artifactPath}): ${error.message}`);
		}
		if (canonicalJson(value) !== text || canonicalJson(sanitizeValue(value)) !== text) throw new Error(`artifact is not canonical sanitized JSON: ${artifactPath}`);
		if (artifactPath === "reconstruction.json") validateReconstruction(value);
	} else if (artifactPath.endsWith(".ndjson")) {
		const rebuilt = artifactBytes(artifactPath, text);
		if (!rebuilt.equals(bytes)) throw new Error(`artifact is not canonical sanitized NDJSON: ${artifactPath}`);
	} else if (sanitizeText(text) !== text) throw new Error(`artifact contains unsanitized content: ${artifactPath}`);
}

function validateReconstruction(record) { if (!isPlainObject(record)) throw new Error("reconstruction schema violation");
	assertExactKeys(record, ["layoutHashes", "logicalFiles", "logicalFingerprint", "schemaVersion", "subjectFingerprint"], ["logicalFiles", "schemaVersion", "subjectFingerprint"], "reconstruction record");
	if (record.schemaVersion !== 1 || !SHA256.test(record.subjectFingerprint) || !Array.isArray(record.logicalFiles)) throw new Error("reconstruction schema violation");
	if (record.logicalFingerprint !== undefined && !SHA256.test(record.logicalFingerprint)) throw new Error("reconstruction schema violation"); if (record.layoutHashes !== undefined && (!isPlainObject(record.layoutHashes) || Object.values(record.layoutHashes).some((hash) => !SHA256.test(hash)))) throw new Error("reconstruction schema violation"); }

function assertExactKeys(value, allowed, required, label) { const allowedSet = new Set(allowed);
	if (Object.keys(value).some((key) => !allowedSet.has(key)) || required.some((key) => !Object.hasOwn(value, key))) throw new Error(`${label} schema violation`);
}

function isPlainObject(value) { if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
	const prototype = Object.getPrototypeOf(value); return prototype === Object.prototype || prototype === null; }

function prepareEmptyRoot(bundleDir) { if (typeof bundleDir !== "string" || bundleDir.length === 0) throw new TypeError("bundleDir must be a path");
	const root = resolve(bundleDir);
	if (!existsSync(root)) mkdirSync(root, { recursive: true });
	const stat = lstatSync(root);
	if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("bundle root must be a non-symlink directory");
	if (readdirSync(root).length !== 0) throw new Error("bundle root must be empty");
	return root; }

function requireSafeRoot(bundleDir) {
	if (typeof bundleDir !== "string" || bundleDir.length === 0 || !existsSync(bundleDir)) throw new Error("missing bundle directory");
	const root = resolve(bundleDir), stat = lstatSync(root);
	if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("unsafe symlink bundle root");
	return root; }

function resolveInside(root, artifactPath) {
	const target = resolve(root, ...artifactPath.split("/")), prefix = root.endsWith(sep) ? root : `${root}${sep}`;
	if (!target.startsWith(prefix)) throw new Error(`artifact path escaped bundle: ${artifactPath}`);
	return target; }

function scanBundle(root) {
	const files = new Set();
	const directories = new Set();
	const rootReal = realpathSync.native(root);
	function walk(directory, prefix) {
		for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => compareText(left.name, right.name))) {
			const artifactPath = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
			const target = resolve(directory, entry.name);
			const stat = lstatSync(target);
			if (stat.isSymbolicLink()) throw new Error(`unsafe symlink artifact: ${artifactPath}`);
			const targetReal = realpathSync.native(target);
			if (targetReal !== rootReal && !targetReal.startsWith(`${rootReal}${sep}`)) throw new Error(`unsafe artifact escape: ${artifactPath}`);
			if (stat.isDirectory()) {
				validateArtifactPath(artifactPath);
				directories.add(artifactPath);
				walk(target, artifactPath);
			} else if (stat.isFile()) {
				if (!CONTROL_FILES.has(artifactPath)) validateArtifactPath(artifactPath);
				files.add(artifactPath);
			} else throw new Error(`unsafe non-regular artifact: ${artifactPath}`);
		}
	}
	walk(root, "");
	if (files.size > MAX_ARTIFACTS + CONTROL_FILES.size) throw new Error("artifact count exceeds limit");
	return { directories, files };
}

function parentDirectories(paths) {
	const result = new Set();
	for (const artifactPath of paths) { const parts = artifactPath.split("/");
		for (let index = 1; index < parts.length; index += 1) result.add(parts.slice(0, index).join("/"));
	}
	return result; }
