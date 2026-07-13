import {
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	realpathSync,
} from "node:fs";
import { delimiter, dirname, isAbsolute, join, relative, resolve } from "node:path";

const PACKAGE_NAME = "lazyantigravity";
const HOOK_IDS = Object.freeze(["PreInvocation", "Stop"]);
const MCP_IDS = Object.freeze(["database", "git-bash", "lsp"]);
const ACTIVE_SKILLS = Object.freeze([
	"ast-grep", "debugging", "frontend-ui-ux", "git-master", "init-deep",
	"lsp", "lsp-setup", "programming", "review-work", "rules", "start-work",
	"ulw", "ulw-loop", "ulw-plan", "visual-qa",
]);
const SAFE_MCP_CALLS = Object.freeze({
	"git-bash": Object.freeze({ name: "which_bash", arguments: Object.freeze({}) }),
	lsp: Object.freeze({ name: "status", arguments: Object.freeze({}) }),
	database: Object.freeze({ name: "db_list_connections", arguments: Object.freeze({}) }),
});
const REMOTE_VALUE = /(?:^[a-z][a-z0-9+.-]*:\/\/|^\\\\|^[^/\\\s]+@[^/\\\s]+:)/i;
const WINDOWS_ENV_KEYS = Object.freeze(["SystemRoot", "WINDIR", "ComSpec", "PATHEXT"]);
const LOCALE_ENV_KEYS = Object.freeze(["LANG", "LC_ALL", "LC_CTYPE"]);

export function inspectStagedPackage(layoutRoot) {
	const root = requireDirectory(layoutRoot, "layoutRoot");
	const packageJson = readJson(root, "package.json");
	const pluginJson = readJson(root, "plugin.json");
	if (packageJson.name !== PACKAGE_NAME) fail("package name must be lazyantigravity");
	if (pluginJson.name !== PACKAGE_NAME) fail("plugin name must be lazyantigravity");

	const hookIds = inspectHooks(root, readJson(root, "hooks.json"));
	const mcpServers = inspectMcpServers(root, readJson(root, "mcp_config.json"));
	const activeSkills = inspectSkills(root);
	const experimentalIncluded = inspectExperimental(root);
	if (experimentalIncluded.length !== 0) fail(`experimental skills are not installable: ${experimentalIncluded.join(", ")}`);

	return Object.freeze({
		hookIds,
		mcpIds: Object.freeze(Object.keys(mcpServers)),
		mcpServers,
		activeSkills,
		experimentalIncluded,
		pluginName: pluginJson.name,
		packageName: packageJson.name,
	});
}

export function hookInput(event, layoutRoot, artifactRoot) {
	if (!HOOK_IDS.includes(event)) throw new TypeError(`unsupported hook event: ${String(event)}`);
	const workspaceRoot = requireDirectory(layoutRoot, "layoutRoot");
	const artifacts = requireAbsolutePath(artifactRoot, "artifactRoot");
	const common = {
		conversationId: "lazyantigravity-staged-validation",
		workspacePaths: Object.freeze([workspaceRoot]),
		transcriptPath: join(artifacts, "transcript.jsonl"),
		artifactDirectoryPath: artifacts,
	};
	return event === "PreInvocation"
		? Object.freeze({ ...common, invocationNum: 1, initialNumSteps: 1 })
		: Object.freeze({ ...common, executionNum: 1, terminationReason: "model_stop", fullyIdle: true });
}

export function safeMcpCall(serverId) {
	const call = SAFE_MCP_CALLS[serverId];
	if (call === undefined) throw new TypeError(`unsupported MCP server: ${String(serverId)}`);
	return call;
}

export function isolatedChildEnv({ root, nodePath, safeToolPaths = [], baseEnv = process.env }) {
	const isolationRoot = requireAbsolutePath(root, "root");
	const executable = requireFile(nodePath, "nodePath");
	if (!isRecord(baseEnv)) throw new TypeError("baseEnv must be a plain object");
	if (!Array.isArray(safeToolPaths)) throw new TypeError("safeToolPaths must be an array");
	mkdirSync(isolationRoot, { recursive: true });

	const env = {};
	const inheritedKeys = process.platform === "win32" ? [...WINDOWS_ENV_KEYS, ...LOCALE_ENV_KEYS] : LOCALE_ENV_KEYS;
	for (const key of inheritedKeys) {
		const value = stringEnv(baseEnv, key);
		if (value !== "") env[key] = value;
	}
	const directories = {
		HOME: "home",
		USERPROFILE: "home",
		APPDATA: "appdata/roaming",
		LOCALAPPDATA: "appdata/local",
		TMP: "tmp",
		TEMP: "tmp",
		TMPDIR: "tmp",
		XDG_CONFIG_HOME: "xdg/config",
		XDG_CACHE_HOME: "xdg/cache",
		XDG_DATA_HOME: "xdg/data",
		XDG_STATE_HOME: "xdg/state",
		XDG_RUNTIME_DIR: "xdg/runtime",
		CODEX_LSP_DAEMON_DIR: "codex-lsp-daemon",
	};
	for (const [key, suffix] of Object.entries(directories)) {
		const directory = join(isolationRoot, ...suffix.split("/"));
		mkdirSync(directory, { recursive: true });
		env[key] = directory;
	}
	const pathDirectories = [dirname(executable), ...safeToolPaths.map((path, index) =>
		dirname(requireFile(path, `safeToolPaths[${index}]`)))];
	env.PATH = [...new Map(pathDirectories.map((directory) => [
		process.platform === "win32" ? directory.toLowerCase() : directory,
		directory,
	])).values()].join(delimiter);
	return Object.freeze(env);
}

function inspectHooks(root, manifest) {
	requireExactKeys(manifest, [PACKAGE_NAME], "hooks manifest");
	const hooks = manifest[PACKAGE_NAME];
	requireExactKeys(hooks, HOOK_IDS, "hook IDs");
	for (const event of HOOK_IDS) {
		const handlers = hooks[event];
		if (!Array.isArray(handlers) || handlers.length !== 1 || !isRecord(handlers[0])) {
			fail(`${event} must have exactly one command handler`);
		}
		const handler = handlers[0];
		requireExactKeys(handler, ["type", "command", "timeout"], `${event} handler`);
		const expectedCommand = `node ./scripts/antigravity-hook.mjs ${event}`;
		if (handler.type !== "command" || handler.command !== expectedCommand || handler.timeout !== 10) {
			fail(`${event} must use only the pinned local command handler`);
		}
	}
	requireContainedFile(root, "./scripts/antigravity-hook.mjs", "hook target");
	return HOOK_IDS;
}

function inspectMcpServers(root, manifest) {
	requireExactKeys(manifest, ["mcpServers"], "MCP manifest");
	const servers = manifest.mcpServers;
	requireExactKeys(servers, MCP_IDS, "MCP IDs");
	const inspected = {};
	for (const id of MCP_IDS) {
		const server = servers[id];
		requireExactKeys(server, ["command", "args", "cwd"], `MCP server ${id}`);
		if (server.command !== "node" || server.cwd !== ".") fail(`${id} must use literal node from cwd '.'`);
		if (!Array.isArray(server.args) || server.args.length === 0 || server.args.some((arg) => typeof arg !== "string")) {
			fail(`${id} args must be a non-empty string array`);
		}
		if (server.args.some((arg) => REMOTE_VALUE.test(arg))) fail(`${id} must not contain a remote or URL value`);
		requireContainedFile(root, server.args[0], `MCP server ${id} target`);
		inspected[id] = Object.freeze({ command: server.command, args: Object.freeze([...server.args]), cwd: server.cwd });
	}
	return Object.freeze(inspected);
}

function inspectSkills(root) {
	const skillsRoot = requireDirectory(join(root, "skills"), "skills directory");
	const directories = readdirSync(skillsRoot, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort(compareText);
	if (!sameValues(directories, ACTIVE_SKILLS)) fail("active skill directories do not match the pinned catalog of 15");
	for (const name of ACTIVE_SKILLS) {
		const source = readFileSync(requireFile(join(skillsRoot, name, "SKILL.md"), `${name} SKILL.md`), "utf8");
		const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source)?.[1];
		if (frontmatter === undefined) fail(`${name} SKILL.md is missing YAML frontmatter`);
		const declaredName = /^name:\s*([^\r\n]+)\s*$/m.exec(frontmatter)?.[1]?.trim();
		if (declaredName !== name) fail(`${name} SKILL.md frontmatter name does not match its directory`);
	}
	return ACTIVE_SKILLS;
}

function inspectExperimental(root) {
	const candidates = [join(root, "experimental-skills"), join(root, "experimental")];
	const included = candidates.flatMap((directory) => existsSync(directory)
		? readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
		: []);
	return Object.freeze([...new Set(included)].sort(compareText));
}

function readJson(root, filename) {
	const path = requireContainedFile(root, `./${filename}`, filename);
	try {
		const value = JSON.parse(readFileSync(path, "utf8"));
		if (!isRecord(value)) fail(`${filename} must contain a JSON object`);
		return value;
	} catch (error) {
		if (error instanceof SyntaxError) fail(`${filename} is not valid JSON`);
		throw error;
	}
}

function requireContainedFile(root, candidate, label) {
	if (typeof candidate !== "string" || !candidate.startsWith("./") || candidate.includes("\\") || REMOTE_VALUE.test(candidate)) {
		fail(`${label} must be a local forward-slash relative path`);
	}
	const path = resolve(root, candidate);
	if (!within(root, path)) fail(`${label} escapes the staged layout`);
	return requireFile(path, label);
}

function requireDirectory(value, label) {
	const path = requireAbsolutePath(value, label);
	if (!existsSync(path) || !lstatSync(path).isDirectory()) throw new TypeError(`${label} must be an existing directory`);
	return realpathSync(path);
}

function requireFile(value, label) {
	const path = requireAbsolutePath(value, label);
	if (!existsSync(path) || !lstatSync(path).isFile()) throw new TypeError(`${label} must be an existing file`);
	return realpathSync(path);
}

function requireAbsolutePath(value, label) {
	if (typeof value !== "string" || value.length === 0 || !isAbsolute(value)) throw new TypeError(`${label} must be an absolute path`);
	return resolve(value);
}

function requireExactKeys(value, expected, label) {
	if (!isRecord(value) || !sameValues(Object.keys(value), expected)) fail(`${label} must contain exactly: ${expected.join(", ")}`);
}

function sameValues(actual, expected) {
	return actual.length === expected.length && [...actual].sort(compareText).every((value, index) => value === [...expected].sort(compareText)[index]);
}

function stringEnv(env, requestedKey) {
	const entry = Object.entries(env).find(([key]) => key.toLowerCase() === requestedKey.toLowerCase());
	return typeof entry?.[1] === "string" ? entry[1] : "";
}

function within(root, candidate) {
	const rel = relative(root, candidate);
	return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function compareText(left, right) {
	return left.localeCompare(right, "en");
}

function isRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(message) {
	throw new Error(`staged distribution contract violation: ${message}`);
}
