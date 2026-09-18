import { lstatSync, realpathSync, statSync } from "node:fs";
import { delimiter, dirname, isAbsolute, relative, resolve, sep } from "node:path";

export function canonicalPath(path, allowMissing = false) {
	const absolute = resolve(path);
	try {
		lstatSync(absolute);
		return realpathSync(absolute);
	} catch (error) {
		if (!allowMissing || error.code !== "ENOENT") throw error;
		try {
			lstatSync(absolute);
			throw new Error("Unresolved symbolic link");
		} catch (linkError) {
			if (linkError.code !== "ENOENT") throw linkError;
		}
		const parent = dirname(absolute);
		if (parent === absolute) throw error;
		return resolve(canonicalPath(parent, true), relative(parent, absolute));
	}
}

export function getWorkspaceRoot() {
	return canonicalPath(process.env.LAZYANTIGRAVITY_WORKSPACE_ROOT || process.cwd());
}

export function isInsideRoot(candidate, root) {
	const rel = relative(root, candidate);
	return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
}

export function allowedRoots(evidence = false) {
	const roots = [getWorkspaceRoot()];
	if (evidence) {
		for (const raw of (process.env.LAZYANTIGRAVITY_ALLOWED_EVIDENCE_ROOTS || "").split(delimiter).filter(Boolean)) {
			if (!isAbsolute(raw)) throw new Error("Allowed evidence roots must be absolute paths");
			const root = canonicalPath(raw);
			if (!statSync(root).isDirectory()) throw new Error("Allowed evidence root must be a directory");
			roots.push(root);
		}
	}
	return roots;
}

export function confinePath(raw, { base = getWorkspaceRoot(), allowMissing = false, evidence = false, kind } = {}) {
	if (typeof raw !== "string" || !raw.trim() || raw.startsWith("~")) throw new Error(`input '${raw}' must be a non-empty workspace-relative path (absolute and ~ paths are rejected)`);
	let path;
	try {
		path = canonicalPath(resolve(base, raw), allowMissing);
	} catch (error) {
		if (error.code === "ENOENT") throw new Error(`input '${raw}' does not exist in the workspace`);
		throw error;
	}
	if (!allowedRoots(evidence).some((root) => isInsideRoot(path, root))) throw new Error(`input '${raw}' resolves outside the workspace root (workspace-relative paths are enforced${evidence ? ", explicit evidence roots excepted" : ""})`);
	if (kind && !(kind === "directory" ? statSync(path).isDirectory() : statSync(path).isFile())) throw new Error(`Path must be a ${kind}`);
	return path;
}
