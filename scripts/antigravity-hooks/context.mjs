import { lstatSync, realpathSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";

const SOURCE_LIMIT_BYTES = 4 * 1024;
const SOURCE_CONTENT_BUDGET_BYTES = 3_584;
export const TOTAL_CONTEXT_LIMIT_BYTES = 8 * 1024;
const SOURCE_SPECS = Object.freeze([
	{ kind: "brief", relPath: ".omo/ulw-loop/brief.md" },
	{ kind: "goals", relPath: ".omo/ulw-loop/goals.json" },
]);

export function collectPreInvocationOmoContext(payload) {
	const workspaceRoots = canonicalWorkspaceRoots(payload.workspacePaths);
	if (!workspaceRoots.ok) return workspaceRoots;

	const parts = [];
	const seenSourcePaths = new Set();
	for (const workspaceRoot of workspaceRoots.value) {
		for (const spec of SOURCE_SPECS) {
			const source = readAllowedSource(workspaceRoot, spec);
			if (!source.ok) return source;
			if (!source.value) continue;
			if (seenSourcePaths.has(source.value.realPath)) continue;
			seenSourcePaths.add(source.value.realPath);
			parts.push(source.value);
		}
	}

	if (parts.length === 0) return success(null);
	return success(formatBoundedMessage(parts));
}

function canonicalWorkspaceRoots(workspacePaths) {
	const roots = [];
	const seen = new Set();
	for (const workspacePath of workspacePaths) {
		let realPath;
		try {
			realPath = realpathSync(workspacePath);
		} catch {
			continue;
		}
		const root = normalizePath(realPath);
		if (!seen.has(root)) {
			seen.add(root);
			roots.push(root);
		}
	}
	return success(roots.sort((left, right) => left.localeCompare(right)));
}

function readAllowedSource(workspaceRoot, spec) {
	const candidate = join(workspaceRoot, ...spec.relPath.split("/"));
	let linkStat;
	try {
		linkStat = lstatSync(candidate);
	} catch (error) {
		if (error?.code === "ENOENT") return success(null);
		return failure("ANTIGRAVITY_CONTEXT_SOURCE_UNREADABLE");
	}
	if (!linkStat.isFile() && !linkStat.isSymbolicLink()) return failure("ANTIGRAVITY_CONTEXT_SOURCE_UNREADABLE");

	let realPath;
	try {
		realPath = normalizePath(realpathSync(candidate));
	} catch {
		return failure("ANTIGRAVITY_CONTEXT_SOURCE_UNREADABLE");
	}
	if (!isInsideWorkspace(realPath, workspaceRoot)) return failure("ANTIGRAVITY_CONTEXT_PATH_UNSAFE");
	try {
		if (!statSync(realPath).isFile()) return failure("ANTIGRAVITY_CONTEXT_SOURCE_UNREADABLE");
		const raw = readFileSync(realPath, "utf8").trim();
		if (raw.length === 0) return success(null);
		const content = spec.kind === "goals"
			? canonicalGoalsJson(raw, SOURCE_CONTENT_BUDGET_BYTES)
			: truncateUtf8(redactSecrets(raw), SOURCE_CONTENT_BUDGET_BYTES);
		if (content === null) return failure("ANTIGRAVITY_CONTEXT_GOALS_INVALID");
		return success({
			kind: spec.kind,
			relPath: spec.relPath,
			workspaceRoot,
			realPath,
			content,
		});
	} catch {
		return failure("ANTIGRAVITY_CONTEXT_SOURCE_UNREADABLE");
	}
}

function canonicalGoalsJson(raw, maxBytes) {
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!isValidGoalsPlan(parsed)) return null;
	const redacted = redactJsonSecrets(parsed);
	const full = `${JSON.stringify(redacted, null, 2)}\n`;
	if (byteLength(full) <= maxBytes) return full;
	return boundedGoalsSummary(redacted, maxBytes);
}

function isValidGoalsPlan(value) {
	return (
		isRecord(value) &&
		value.version === 1 &&
		Array.isArray(value.goals) &&
		value.goals.every((goal) =>
			isRecord(goal) &&
			typeof goal.id === "string" &&
			goal.id.length > 0 &&
			typeof goal.title === "string" &&
			typeof goal.objective === "string" &&
			typeof goal.status === "string" &&
			Array.isArray(goal.successCriteria)
		)
	);
}

function formatBoundedMessage(parts) {
	let message = "<lazyantigravity-omo-context>\n";
	for (const source of parts) {
		const header =
			`[source kind=${source.kind} path=${source.relPath} workspace=${source.workspaceRoot} ` +
			`maxBytes=${SOURCE_LIMIT_BYTES}]\n`;
		const footer = "\n[/source]\n";
		const remaining = TOTAL_CONTEXT_LIMIT_BYTES - byteLength(message) - byteLength(header) - byteLength(footer) - byteLength("</lazyantigravity-omo-context>\n");
		if (remaining <= 0) break;
		if (byteLength(source.content) > remaining && source.kind === "goals") continue;
		const content = source.kind === "goals" ? source.content : truncateUtf8(source.content, remaining);
		message += `${header}${content}${footer}`;
	}
	message += "</lazyantigravity-omo-context>\n";
	return byteLength(message) <= TOTAL_CONTEXT_LIMIT_BYTES ? message : truncateUtf8(message, TOTAL_CONTEXT_LIMIT_BYTES);
}

function redactSecrets(text) {
	return text
		.replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, "sk-[REDACTED_SECRET]")
		.replace(/\bAIza[A-Za-z0-9_-]{10,}\b/g, "AIza[REDACTED_SECRET]")
		.replace(/\bgh[psu]_[A-Za-z0-9_]{10,}\b/g, "ghp_[REDACTED_SECRET]")
		.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{10,}\b/gi, "Bearer [REDACTED_SECRET]")
		.replace(
			/\b(api[_-]?key|secret|password|passwd|token|private[_-]?key|auth[_-]?key|credentials|session[_-]?id)\b\s*[:=]\s*["']?[^"'\s,}]{6,}["']?/gi,
			"$1=[REDACTED_SECRET]",
		);
}

function redactJsonSecrets(value) {
	if (typeof value === "string") return redactSecrets(value);
	if (Array.isArray(value)) return value.map(redactJsonSecrets);
	if (!isRecord(value)) return value;
	return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, redactJsonSecrets(nested)]));
}

function boundedGoalsSummary(plan, maxBytes) {
	const goals = Array.isArray(plan.goals) ? plan.goals : [];
	const summary = {
		version: plan.version,
		activeGoalId: plan.activeGoalId,
		truncated: true,
		originalGoalCount: goals.length,
		goals: [],
	};
	for (const goal of goals) {
		summary.goals.push({
			id: boundedString(goal.id, 96),
			title: boundedString(goal.title, 160),
			objective: boundedString(goal.objective, 320),
			status: boundedString(goal.status, 64),
			successCriteriaCount: Array.isArray(goal.successCriteria) ? goal.successCriteria.length : 0,
		});
		const rendered = `${JSON.stringify(summary, null, 2)}\n`;
		if (byteLength(rendered) > maxBytes) {
			summary.goals.pop();
			break;
		}
	}
	let rendered = `${JSON.stringify(summary, null, 2)}\n`;
	if (byteLength(rendered) <= maxBytes) return rendered;
	summary.goals = [];
	rendered = `${JSON.stringify(summary, null, 2)}\n`;
	return byteLength(rendered) <= maxBytes
		? rendered
		: `${JSON.stringify({ version: plan.version, truncated: true, originalGoalCount: goals.length }, null, 2)}\n`;
}

function boundedString(value, maxChars) {
	if (typeof value !== "string") return "";
	return value.length > maxChars ? `${value.slice(0, maxChars)}... [truncated]` : value;
}

function truncateUtf8(text, maxBytes) {
	if (byteLength(text) <= maxBytes) return text;
	const suffix = "\n... [truncated]";
	const budget = Math.max(0, maxBytes - byteLength(suffix));
	let output = "";
	let used = 0;
	for (const char of text) {
		const next = byteLength(char);
		if (used + next > budget) break;
		output += char;
		used += next;
	}
	return `${output}${suffix}`;
}

function isInsideWorkspace(realPath, workspaceRoot) {
	const root = workspaceRoot.endsWith(sep) ? workspaceRoot : `${workspaceRoot}${sep}`;
	return realPath === workspaceRoot || realPath.startsWith(root);
}

function normalizePath(value) {
	return realpathSync.native ? realpathSync.native(value) : value;
}

function byteLength(value) {
	return Buffer.byteLength(value, "utf8");
}

function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function success(value) {
	return { ok: true, value };
}

function failure(code) {
	return { ok: false, error: { code } };
}
