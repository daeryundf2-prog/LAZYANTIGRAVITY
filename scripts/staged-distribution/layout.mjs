import { createHash } from "node:crypto";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

export const LAYOUTS = Object.freeze([
	Object.freeze({ id: "ide-dot-workspace", relativeRoot: "workspace root/.agents/plugins/lazyantigravity", ruleStatus: "unverified" }),
	Object.freeze({ id: "ide-underscore-workspace", relativeRoot: "workspace root/_agents/plugins/lazyantigravity", ruleStatus: "unverified" }),
	Object.freeze({ id: "ide-global", relativeRoot: "user home/.gemini/config/plugins/lazyantigravity", ruleStatus: "unverified" }),
	Object.freeze({ id: "cli-global", relativeRoot: "user home/.gemini/antigravity-cli/plugins/lazyantigravity", ruleStatus: "not-applicable" }),
]);

const COLLECTED_BYTES = new WeakMap();
const MANIFEST_KEYS = new Set(["schemaVersion", "files", "directories"]);
const NETWORK_OR_MAINTENANCE = new Set([
	"scripts/auto-update-lazycodex.mjs",
	"scripts/auto-update-state.mjs",
	"scripts/install-browsing-deps.mjs",
	"scripts/migrate-codex-config.mjs",
	"scripts/prune-stale-evidence.mjs",
	"scripts/rebuild-components.mjs",
	"scripts/sync-components.mjs",
	"scripts/sync-skills.mjs",
	"scripts/sync-telemetry.mjs",
]);

class LayoutContractError extends Error {
	constructor(code, message) {
		super(`[${code}] ${message}`);
		this.name = "LayoutContractError";
		this.code = code;
	}
}

function reject(code, message) {
	throw new LayoutContractError(code, message);
}

function sha256(value) {
	return createHash("sha256").update(value).digest("hex");
}

function isPlainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeRelativePath(value, label) {
	if (typeof value !== "string" || value.length === 0) reject("manifest.path.empty", `${label} is empty`);
	if (value.includes("\\")) reject("manifest.path.backslash", `${label} must use forward slashes: ${value}`);
	if (value.includes("\0")) reject("manifest.path.invalid", `${label} contains NUL`);
	if (isAbsolute(value) || value.startsWith("/") || value.startsWith("//")) {
		reject("manifest.path.absolute", `${label} is absolute: ${value}`);
	}
	if (/^[A-Za-z]:/.test(value)) reject("manifest.path.drive", `${label} has a drive prefix: ${value}`);
	const parts = value.split("/");
	if (parts.some((part) => part === "" || part === "." || part === "..")) {
		reject("manifest.path.traversal", `${label} contains an empty, dot, or traversal segment: ${value}`);
	}
	return parts.join("/");
}

function rejectForbiddenPath(path) {
	const lower = path.toLowerCase();
	const parts = lower.split("/");
	if (parts.includes("experimental-skills") || parts.includes("experimental")) {
		reject("manifest.path.experimental", `experimental content is not installable: ${path}`);
	}
	if (parts.includes("model-catalog.json") || parts.includes("models") || parts.includes("model")) {
		reject("manifest.path.model", `model catalogs are not installable: ${path}`);
	}
	if (parts.includes("evidence") || lower === ".omo" || lower.startsWith(".omo/")) {
		reject("manifest.path.evidence", `evidence is not installable: ${path}`);
	}
	if (parts.some((part) => part === "test" || part === "tests" || part === "__tests__")
		|| parts.some((part) => /\.(?:test|spec)\.[^.]+$/.test(part))) {
		reject("manifest.path.test", `test content is not installable: ${path}`);
	}
	if (NETWORK_OR_MAINTENANCE.has(lower) || parts.some((part) => part === "network" || part === "telemetry")) {
		reject("manifest.path.maintenance", `network or maintenance content is not installable: ${path}`);
	}
}

export function validateInstalledManifest(manifest) {
	if (!isPlainObject(manifest)) reject("manifest.invalid", "installed manifest must be an object");
	const extraKeys = Object.keys(manifest).filter((key) => !MANIFEST_KEYS.has(key));
	if (extraKeys.length > 0) reject("manifest.key.invalid", `unsupported manifest keys: ${extraKeys.join(", ")}`);
	if (manifest.schemaVersion !== 1) reject("manifest.version.invalid", "schemaVersion must equal 1");
	if (manifest.files !== undefined && !Array.isArray(manifest.files)) reject("manifest.files.invalid", "files must be an array");
	if (manifest.directories !== undefined && !Array.isArray(manifest.directories)) {
		reject("manifest.directories.invalid", "directories must be an array");
	}
	const files = manifest.files ?? [];
	const directories = manifest.directories ?? [];
	if (files.length + directories.length === 0) reject("manifest.empty", "installed manifest has no entries");
	const exact = new Set();
	const folded = new Map();
	const parseEntries = (entries, kind) => entries.map((entry, index) => {
		const path = normalizeRelativePath(entry, `${kind}[${index}]`);
		rejectForbiddenPath(path);
		if (exact.has(path)) reject("manifest.path.duplicate", `duplicate path: ${path}`);
		const caseKey = path.normalize("NFC").toLowerCase();
		if (folded.has(caseKey)) reject("manifest.path.case-collision", `${folded.get(caseKey)} case-collides with ${path}`);
		exact.add(path);
		folded.set(caseKey, path);
		return path;
	});
	return Object.freeze({
		schemaVersion: 1,
		files: Object.freeze(parseEntries(files, "files")),
		directories: Object.freeze(parseEntries(directories, "directories")),
	});
}

function within(root, candidate) {
	const rel = relative(root, candidate);
	return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function inspectPath(root, rootReal, relPath) {
	let current = root;
	for (const part of relPath.split("/")) {
		current = join(current, part);
		let stat;
		try {
			stat = lstatSync(current);
		} catch (error) {
			if (error instanceof Error && "code" in error && error.code === "ENOENT") {
				reject("package.path.missing", `missing package path: ${relPath}`);
			}
			throw error;
		}
		if (stat.isSymbolicLink()) reject("package.path.symlink", `symlink, junction, or reparse point: ${relPath}`);
		if (stat.isSocket() || stat.isFIFO() || stat.isCharacterDevice() || stat.isBlockDevice()) {
			reject("package.path.special", `special file is not installable: ${relPath}`);
		}
		const currentReal = realpathSync(current);
		if (!within(rootReal, currentReal)) reject("package.path.escape", `package path escapes snapshot root: ${relPath}`);
	}
	return current;
}

export function collectPackageFiles(snapshotRoot, manifest) {
	const parsed = validateInstalledManifest(manifest);
	const root = resolve(snapshotRoot);
	if (!existsSync(root)) reject("package.root.missing", `snapshot root is missing: ${root}`);
	const rootStat = lstatSync(root);
	if (rootStat.isSymbolicLink()) reject("package.root.symlink", `snapshot root is a symlink or reparse point: ${root}`);
	if (!rootStat.isDirectory()) reject("package.root.invalid", `snapshot root is not a directory: ${root}`);
	const rootReal = realpathSync(root);
	const records = [];
	const bytesByPath = new Map();
	const exact = new Set();
	const folded = new Map();
	const addFile = (relPath) => {
		if (exact.has(relPath)) reject("package.path.duplicate", `duplicate expanded file: ${relPath}`);
		const caseKey = relPath.normalize("NFC").toLowerCase();
		if (folded.has(caseKey)) reject("package.path.case-collision", `${folded.get(caseKey)} case-collides with ${relPath}`);
		const absolute = inspectPath(root, rootReal, relPath);
		if (!lstatSync(absolute).isFile()) reject("package.path.invalid", `package path is not a regular file: ${relPath}`);
		const bytes = readFileSync(absolute);
		if (!lstatSync(absolute).isFile() || !within(rootReal, realpathSync(absolute))) {
			reject("package.path.changed", `package path changed while reading: ${relPath}`);
		}
		exact.add(relPath);
		folded.set(caseKey, relPath);
		bytesByPath.set(relPath, bytes);
		records.push(Object.freeze({ path: relPath, sha256: sha256(bytes), size: bytes.byteLength }));
	};
	const collectDirectory = (relDirectory) => {
		const absolute = inspectPath(root, rootReal, relDirectory);
		if (!lstatSync(absolute).isDirectory()) reject("package.directory.invalid", `not a directory: ${relDirectory}`);
		for (const entry of readdirSync(absolute, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
			const child = normalizeRelativePath(`${relDirectory}/${entry.name}`, "expanded path");
			rejectForbiddenPath(child);
			const childAbsolute = inspectPath(root, rootReal, child);
			const childStat = lstatSync(childAbsolute);
			if (childStat.isDirectory()) collectDirectory(child);
			else if (childStat.isFile()) addFile(child);
			else reject("package.path.special", `special file is not installable: ${child}`);
		}
	};
	for (const file of parsed.files) addFile(file);
	for (const directory of parsed.directories) collectDirectory(directory);
	records.sort((a, b) => a.path.localeCompare(b.path, "en"));
	const canonicalManifest = `${JSON.stringify(records.map(({ path, sha256: hash, size }) => ({ path, sha256: hash, size })))}\n`;
	Object.defineProperties(records, {
		canonicalManifest: { value: canonicalManifest, enumerable: false },
		manifestHash: { value: sha256(canonicalManifest), enumerable: false },
	});
	COLLECTED_BYTES.set(records, { rootReal, bytesByPath, canonicalManifest });
	return Object.freeze(records);
}

export function stageLayouts({ snapshotRoot, stagingRoot, files }) {
	const collected = COLLECTED_BYTES.get(files);
	if (collected === undefined) reject("stage.files.invalid", "files must come directly from collectPackageFiles");
	const source = resolve(snapshotRoot);
	if (!existsSync(source) || realpathSync(source) !== collected.rootReal) {
		reject("stage.snapshot.mismatch", "snapshotRoot does not match the collected package root");
	}
	const destination = resolve(stagingRoot);
	if (existsSync(destination)) reject("stage.root.exists", `staging root already exists: ${destination}`);
	const parent = dirname(destination);
	if (!existsSync(parent)) reject("stage.parent.missing", `caller-created staging parent is missing: ${parent}`);
	const parentStat = lstatSync(parent);
	if (parentStat.isSymbolicLink()) reject("stage.parent.symlink", `staging parent is a symlink or reparse point: ${parent}`);
	if (!parentStat.isDirectory()) reject("stage.parent.invalid", `staging parent is not a directory: ${parent}`);
	const parentReal = realpathSync(parent);
	if (!within(parentReal, destination)) reject("stage.root.escape", `staging root escapes its parent: ${destination}`);
	const layoutHash = sha256(collected.canonicalManifest);
	try {
		mkdirSync(destination);
		const rows = LAYOUTS.map((layout) => {
			const relativeRoot = normalizeRelativePath(layout.relativeRoot, `layout ${layout.id}`);
			const layoutRoot = join(destination, ...relativeRoot.split("/"));
			mkdirSync(layoutRoot, { recursive: true });
			for (const file of files) {
				const target = join(layoutRoot, ...file.path.split("/"));
				mkdirSync(dirname(target), { recursive: true });
				writeFileSync(target, collected.bytesByPath.get(file.path), { flag: "wx" });
				if (sha256(readFileSync(target)) !== file.sha256) reject("stage.bytes.mismatch", `staged bytes differ: ${file.path}`);
			}
			return Object.freeze({ ...layout, root: layoutRoot, fileCount: files.length, layoutHash });
		});
		return Object.freeze({ canonicalManifest: collected.canonicalManifest, layoutHash, rows: Object.freeze(rows) });
	} catch (error) {
		rmSync(destination, { recursive: true, force: true });
		throw error;
	}
}
