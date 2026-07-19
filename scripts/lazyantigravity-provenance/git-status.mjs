import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { normalizePath, pathContains } from "./path-utils.mjs";

export function readDirtyState(root) {
	const result = spawnSync("git", ["status", "--short"], {
		cwd: root,
		encoding: "utf8",
	});
	if (result.error !== undefined || result.status !== 0) {
		return [];
	}
	return result.stdout
		.split("\n")
		.map((line) => line.trimEnd())
		.filter(Boolean)
		.map(parseStatusLine);
}

export function createDirtyStateClassifier(root, dirtyStateEntries) {
	function dirtyEntriesForPath(path) {
		return dirtyStateEntries.filter((entry) => pathContains(path, entry.path));
	}

	function classifyPath(path, statusEntries) {
		if (!existsSync(join(root, path))) return "missing";
		if (statusEntries.some((entry) => entry.status === "??")) return "untracked";
		if (statusEntries.length > 0) return "dirty";
		return "clean";
	}

	return { classifyPath, dirtyEntriesForPath };
}

function parseStatusLine(line) {
	const status = line.slice(0, 2);
	const rawPath = line.slice(3);
	const path = normalizePath(rawPath.includes(" -> ") ? rawPath.split(" -> ").at(-1) : rawPath);
	return {
		status,
		path,
		classification: status === "??" ? "untracked" : "dirty",
	};
}
