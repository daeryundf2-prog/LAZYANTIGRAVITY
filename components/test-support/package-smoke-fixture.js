import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const componentRoot = resolve(process.cwd());

export function readTextFile(relativePath) {
	return readFileSync(join(componentRoot, relativePath), "utf8");
}

export function readJsonFile(relativePath) {
	return JSON.parse(readTextFile(relativePath));
}

export function readPackageJson(relativePath) {
	return readJsonFile(relativePath);
}

export function readHooksJson(relativePath) {
	return readJsonFile(relativePath);
}

export function readMcpJson(relativePath) {
	return readJsonFile(relativePath);
}

export function readPluginJson(relativePath) {
	return readJsonFile(relativePath);
}

export function listDirectoryEntries(relativePath) {
	return readdirSync(join(componentRoot, relativePath));
}

export function requireFiles(packageJson, sourcePath) {
	if (!Array.isArray(packageJson.files)) {
		throw new Error(`${sourcePath} must declare files`);
	}
	return packageJson.files;
}

export function requireScripts(packageJson, sourcePath) {
	if (!packageJson.scripts || typeof packageJson.scripts !== "object") {
		throw new Error(`${sourcePath} must declare scripts`);
	}
	return packageJson.scripts;
}

export function collectHookCommandsFromValue(value) {
	const commands = [];
	collectHookCommands(value, commands);
	return commands;
}

function collectHookCommands(value, commands) {
	if (Array.isArray(value)) {
		for (const item of value) collectHookCommands(item, commands);
		return;
	}
	if (!value || typeof value !== "object") return;
	if (typeof value.command === "string") commands.push(value.command);
	for (const child of Object.values(value)) collectHookCommands(child, commands);
}
