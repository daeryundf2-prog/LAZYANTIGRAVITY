import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { join, relative, isAbsolute, sep } from "node:path";
import { loadLedger, appendLedgerEntry, canonicalizePath } from "./audit-ledger.mjs";

const DRIFT_STATE_FILE = "scope-drift-state.json";

const FILE_WRITE_TOOLS = new Set([
	"write_to_file",
	"replace_file_content",
	"multi_replace_file_content",
]);
const FILE_READ_TOOLS = new Set([
	"view_file",
	"list_dir",
	"find_by_name",
	"grep_search",
]);
const COMMAND_TOOL = "run_command";

export function runScopeDriftCheck(input) {
	const workspaceRoot = selectWorkspace(input.workspacePaths);
	if (!workspaceRoot) return { stdout: "{}\n" };

	const toolName = input.toolCall?.name;
	const toolArgs = input.toolCall?.args || {};
	const conversationId = input.conversationId;

	if (FILE_WRITE_TOOLS.has(toolName)) {
		const targetFile = toolArgs.TargetFile;
		if (typeof targetFile === "string" && targetFile.length > 0) {
			const canonical = canonicalizePath(workspaceRoot, targetFile);
			if (canonical) {
				appendLedgerEntry(workspaceRoot, {
					type: "file_write",
					agent_key: `antigravity:${conversationId}`,
					paths: [canonical],
					tool: toolName,
				});
			}
		}
	}

	const state = readDriftState(input.artifactDirectoryPath);
	const key = conversationId;
	if (!state || state.key !== key) return { stdout: "{}\n" };

	const observedPaths = collectObservedPaths(workspaceRoot, conversationId);
	const requestedScope = state.requestedScope || [];
	const outOfScope = [];
	for (const observed of observedPaths) {
		const inScope = requestedScope.some(
			(pattern) => observed === pattern || observed.startsWith(pattern + "/") || pattern === "*",
		);
		if (!inScope) outOfScope.push(observed);
	}

	if (outOfScope.length === 0) return { stdout: "{}\n" };

	appendLedgerEntry(workspaceRoot, {
		type: "scope_drift",
		agent_key: `antigravity:${conversationId}`,
		paths: outOfScope,
		requestedScope,
	});

	const reason = `Scope drift: 다음 경로가 요청된 스코프 밖입니다: ${outOfScope.join(", ")}. ` +
		`요청된 스코프: ${requestedScope.join(", ") || "(미지정)"}`;

	return {
		stdout: JSON.stringify({}) + "\n",
		warning: reason,
	};
}

export function captureRequestedScope(input) {
	const workspaceRoot = selectWorkspace(input.workspacePaths);
	if (!workspaceRoot) return;

	const toolName = input.toolCall?.name;
	const toolArgs = input.toolCall?.args || {};

	let scope = [];
	if (toolName === COMMAND_TOOL) {
		const cwd = toolArgs.Cwd;
		if (typeof cwd === "string" && cwd.length > 0) {
			const canonical = canonicalizePath(workspaceRoot, cwd);
			if (canonical) scope.push(canonical);
		}
	} else if (FILE_WRITE_TOOLS.has(toolName) || FILE_READ_TOOLS.has(toolName)) {
		const target = toolArgs.TargetFile || toolArgs.DirectoryPath || toolArgs.SearchPath || toolArgs.SearchDirectory;
		if (typeof target === "string" && target.length > 0) {
			const canonical = canonicalizePath(workspaceRoot, target);
			if (canonical) scope.push(canonical);
		}
	}

	if (scope.length > 0) {
		writeDriftState(input.artifactDirectoryPath, {
			key: input.conversationId,
			requestedScope: scope,
		});
	}
}

function selectWorkspace(workspacePaths) {
	if (!Array.isArray(workspacePaths)) return null;
	for (const p of workspacePaths) {
		if (typeof p === "string" && p.length > 0 && existsSync(p)) return p;
	}
	return null;
}

function collectObservedPaths(workspaceRoot, conversationId) {
	const ledger = loadLedger(workspaceRoot);
	const agentKey = `antigravity:${conversationId}`;
	const paths = new Set();
	for (const entry of ledger) {
		if (entry.agent_key === agentKey && entry.type === "file_write" && Array.isArray(entry.paths)) {
			for (const p of entry.paths) paths.add(p);
		}
	}
	return [...paths];
}

function readDriftState(artifactDir) {
	if (!artifactDir) return null;
	const path = join(artifactDir, DRIFT_STATE_FILE);
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return null;
	}
}

function writeDriftState(artifactDir, state) {
	if (!artifactDir) return;
	const path = join(artifactDir, DRIFT_STATE_FILE);
	const tmp = `${path}.tmp-${process.pid}`;
	writeFileSync(tmp, JSON.stringify(state) + "\n", "utf8");
	renameSync(tmp, path);
}
