import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, extname, isAbsolute, join, parse, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const FORBIDDEN_TOOLS = new Set([
	"bun", "bunx", "choco", "choco.exe", "curl", "curl.exe", "npm", "npm.cmd", "npx", "npx.cmd",
	"pnpm", "pnpm.cmd", "scoop", "wget", "wget.exe", "winget", "winget.exe", "yarn", "yarn.cmd",
]);

export function findExecutable(name, pathValue = process.env.PATH ?? "") {
	const extensions = process.platform === "win32"
		? (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";")
		: [""];
	for (const directory of pathValue.split(delimiter).filter(Boolean)) {
		for (const extension of extensions) {
			const candidate = join(directory, `${name}${extension.toLowerCase()}`);
			if (existsSync(candidate)) return resolve(candidate);
			const upperCandidate = join(directory, `${name}${extension.toUpperCase()}`);
			if (existsSync(upperCandidate)) return resolve(upperCandidate);
		}
	}
	return null;
}

function assertProvisionedDirectory(directory) {
	if (!directory || !existsSync(directory)) return;
	const forbidden = readdirSync(directory)
		.map((entry) => entry.toLowerCase())
		.filter((entry) => FORBIDDEN_TOOLS.has(entry));
	if (forbidden.length > 0) throw new Error(`provisioned agy directory contains forbidden tools: ${forbidden.join(",")}`);
}

export function buildChildEnvironment({ isolatedRoot, publishedRuntime, agyExecutable }) {
	const root = resolve(isolatedRoot);
	const runtimeDirectory = dirname(resolve(publishedRuntime));
	const agyDirectory = agyExecutable ? dirname(resolve(agyExecutable)) : null;
	assertProvisionedDirectory(agyDirectory);
	const pathEntries = [runtimeDirectory, agyDirectory]
		.filter(Boolean)
		.filter((value, index, values) => values.findIndex((entry) => entry.toLowerCase() === value.toLowerCase()) === index);
	const environment = {
		HOME: root,
		USERPROFILE: root,
		APPDATA: root,
		LOCALAPPDATA: root,
		XDG_CONFIG_HOME: root,
		XDG_DATA_HOME: root,
		XDG_CACHE_HOME: root,
		XDG_STATE_HOME: root,
		XDG_RUNTIME_DIR: root,
		TMP: root,
		TEMP: root,
		PATH: pathEntries.join(delimiter),
	};
	if (process.platform === "win32") {
		const parsed = parse(root);
		environment.HOMEDRIVE = parsed.root.replace(/[\\/]$/, "");
		environment.HOMEPATH = root.slice(parsed.root.length - 1);
		environment.SystemRoot = process.env.SystemRoot ?? process.env.WINDIR ?? "C:\\Windows";
		environment.WINDIR = environment.SystemRoot;
		environment.ComSpec = process.env.ComSpec ?? join(environment.SystemRoot, "System32", "cmd.exe");
		environment.PATHEXT = process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD";
	}
	return environment;
}

function assertTemporaryChild(root) {
	const temporaryRoot = resolve(tmpdir());
	const relation = relative(temporaryRoot, root);
	if (relation === "" || /^\.\.(?:[\\/]|$)/.test(relation) || isAbsolute(relation)) {
		throw new Error("isolated root must be an owned child of the temporary directory");
	}
	let cursor = temporaryRoot;
	for (const part of relation.split(/[\\/]+/)) {
		cursor = resolve(cursor, part);
		if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) {
			throw new Error("isolated root ancestor must not be a symlink or reparse point");
		}
	}
	if (existsSync(root)) {
		const canonicalRelation = relative(realpathSync(temporaryRoot), realpathSync(root));
		if (canonicalRelation === "" || /^\.\.(?:[\\/]|$)/.test(canonicalRelation) || isAbsolute(canonicalRelation)) {
			throw new Error("isolated root canonical path escapes the temporary directory");
		}
	}
}

export function prepareIsolatedRoot(path) {
	const root = resolve(path);
	assertTemporaryChild(root);
	if (existsSync(root)) {
		const stat = lstatSync(root);
		if (!stat.isDirectory() || stat.isSymbolicLink() || readdirSync(root).length !== 0) {
			throw new Error("isolated root must be a new or empty owned directory");
		}
	} else {
		mkdirSync(root, { recursive: true });
	}
	assertTemporaryChild(root);
	const token = randomUUID();
	const marker = resolve(root, ".lazyantigravity-owned");
	writeFileSync(marker, token, { flag: "wx" });
	return Object.freeze({ root, marker, token });
}

export function cleanupIsolatedRoot(ownership) {
	assertTemporaryChild(ownership.root);
	const stat = lstatSync(ownership.root);
	if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("isolated root ownership changed");
	if (resolve(ownership.marker) !== resolve(ownership.root, ".lazyantigravity-owned")) throw new Error("invalid ownership marker");
	if (readFileSync(ownership.marker, "utf8") !== ownership.token) throw new Error("isolated root ownership marker mismatch");
	rmSync(ownership.root, { recursive: true, force: true });
}

export function executableKind(path) {
	return extname(path).toLowerCase();
}
