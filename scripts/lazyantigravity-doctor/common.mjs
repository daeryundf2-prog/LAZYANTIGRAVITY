import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export function createContext(root) {
	return {
		root,
		failures: [],
		warnings: [],
		fail(section, code, message) {
			this.failures.push({ section, code, message });
		},
		warn(section, code, message) {
			this.warnings.push({ section, code, message });
		},
	};
}

export function finishSection(context, section, payload) {
	const failCount = context.failures.filter((issue) => issue.section === section).length;
	const warnCount = context.warnings.filter((issue) => issue.section === section).length;
	return {
		status: failCount > 0 ? "fail" : warnCount > 0 ? "warn" : "pass",
		failures: context.failures.filter((issue) => issue.section === section),
		warnings: context.warnings.filter((issue) => issue.section === section),
		...payload,
	};
}

export async function readJson(root, relativePath, context, section) {
	try {
		return JSON.parse(await readFile(join(root, relativePath), "utf8"));
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		context.fail(section, "invalid_json", `${relativePath}: ${message}`);
		return null;
	}
}

export async function safeReaddir(path) {
	try {
		return await readdir(path, { withFileTypes: true });
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
		throw error;
	}
}

export async function pathExists(root, relativePath) {
	try {
		await stat(join(root, relativePath));
		return true;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
		throw error;
	}
}

export async function isDirectory(root, relativePath) {
	try {
		return (await stat(join(root, relativePath))).isDirectory();
	} catch {
		return false;
	}
}

export function stripDotSlash(path) {
	return path.replace(/^\.\/+/, "");
}

export function byName(left, right) {
	return left.name.localeCompare(right.name);
}
