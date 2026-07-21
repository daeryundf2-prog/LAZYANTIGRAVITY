// allow: SIZE_OK - Todo 4 keeps the dependency-free portability linter as one CLI until distribution modules are split.
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve, sep, win32 } from "node:path";
import { fileURLToPath } from "node:url";

const CORE = [
	"ast-grep", "debugging", "frontend-ui-ux", "git-master", "init-deep",
	"lsp", "lsp-setup", "programming", "review-work", "rules", "start-work",
	"ulw", "ulw-loop", "ulw-plan", "visual-qa",
];
const EXPERIMENTAL = [
	"browse", "clone", "coding-agent-sessions", "comment-checker", "deep-interview",
	"eval-loop", "hwp-loader", "lcx-contribute-bug-fix", "lcx-doctor",
	"lcx-report-bug", "refactor", "remove-ai-slops", "skill-gen", "sync-rules",
	"teammode", "ultimate-browsing", "ultraresearch", "ulw-research",
	"voice-interpreter",
];
const TOOLS = [
	"view_file", "write_to_file", "replace_file_content", "multi_replace_file_content",
	"list_dir", "find_by_name", "grep_search", "search_web", "read_url_content",
	"run_command", "manage_task", "schedule", "list_permissions", "ask_permission",
	"invoke_subagent", "define_subagent", "send_message", "manage_subagents",
	"ask_question", "generate_image",
];
const TOOL_SET = new Set(TOOLS);
const KNOWN_NON_ANTIGRAVITY_TOOLS = /(?<![A-Za-z0-9_])(?:exec_command|apply_patch|web__run|request_user_input|update_plan|mcp__[a-z0-9_]+)(?![A-Za-z0-9_])/gi;
const TEXT_EXTENSIONS = new Set([
	".md", ".txt", ".json", ".jsonl", ".yaml", ".yml", ".toml", ".js", ".mjs",
	".cjs", ".ts", ".tsx", ".py", ".sh", ".ps1", ".html", ".css",
]);
const FORBIDDEN = [
	/(?<![A-Za-z0-9_])(?:codex_app|multi_agent_v[0-9]+|mcp__[a-z0-9_]+|call_omo_agent|spawn_agent|background_output|wait_agent|close_agent)(?![A-Za-z0-9_])/i,
	/(?<![A-Za-z0-9_])(?:Codex|OpenCode)(?![A-Za-z0-9_])/i,
];

function parseArgs(argv) {
	const options = { skills: [] };
	const valueFlags = new Map([
		["--catalog", "catalog"], ["--modes", "modes"], ["--tools", "tools"],
		["--hashes", "hashes"], ["--skills-root", "skillsRoot"], ["--json", "json"],
		["--skill", "skill"],
	]);
	for (let index = 0; index < argv.length; index += 1) {
		const flag = argv[index];
		const key = valueFlags.get(flag);
		if (!key || index + 1 >= argv.length) throw new Error("invalid-arguments");
		const value = argv[index += 1];
		if (key === "skill") options.skills.push(value);
		else options[key] = value;
	}
	options.catalog ??= "config/antigravity-skills.json";
	const configDir = dirname(resolve(options.catalog));
	options.modes ??= join(configDir, "experimental-skill-modes.json");
	options.tools ??= join(configDir, "antigravity-tools.json");
	options.hashes ??= join(configDir, "experimental-skill-hashes.json");
	return options;
}

function violation(code, location, message) {
	return { code, location: location.replaceAll("\\", "/"), message };
}

function keysEqual(value, expected) {
	return value && typeof value === "object" && !Array.isArray(value)
		&& JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function arraysEqual(actual, expected) {
	return Array.isArray(actual) && JSON.stringify(actual) === JSON.stringify(expected);
}

function contained(root, target) {
	const rel = relative(root, target);
	return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function lineAt(text, index) {
	return text.slice(0, index).split(/\r\n|\r|\n/).length;
}

function decodeText(buffer, path, violations, required = false) {
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
	} catch {
		if (required || TEXT_EXTENSIONS.has(extname(path).toLowerCase())) {
			violations.push(violation("invalid-utf8", `${path}:1`, "Text resources must be valid UTF-8."));
		}
		return null;
	}
}

async function readJson(path, label, violations) {
	try {
		return JSON.parse(await readFile(path, "utf8"));
	} catch {
		violations.push(violation("config-read", `${path}:1`, `Could not read valid ${label} JSON.`));
		return null;
	}
}

async function walkTree(root) {
	const rootStats = await lstat(root);
	if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) throw new Error("unsafe-root");
	const entries = [];
	async function walk(directory) {
		for (const item of await readdir(directory, { withFileTypes: true })) {
			const path = join(directory, item.name);
			const stats = await lstat(path);
			if (stats.isSymbolicLink()) throw new Error(`symlink:${relative(root, path)}`);
			if (stats.isDirectory()) await walk(path);
			else if (stats.isFile()) {
				const bytes = await readFile(path);
				entries.push({
					path: relative(root, path).split(sep).join("/"),
					sha256: createHash("sha256").update(bytes).digest("hex"),
					bytes: bytes.length,
					absolutePath: path,
					buffer: bytes,
				});
			} else throw new Error(`nonregular:${relative(root, path)}`);
		}
	}
	await walk(root);
	return entries.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

function treeReceipt(entries) {
	const canonical = entries.map(({ path, sha256, bytes }) => ({ path, sha256, bytes }));
	return {
		sha256: createHash("sha256").update(JSON.stringify(canonical)).digest("hex"),
		fileCount: entries.length,
		totalBytes: entries.reduce((total, entry) => total + entry.bytes, 0),
	};
}

function parseFrontmatter(text) {
	const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	if (!match) return null;
	const fields = {};
	const lines = match[1].split(/\r?\n/);
	for (let index = 0; index < lines.length; index += 1) {
		const field = lines[index].match(/^([a-z][a-z0-9-]*):(?:\s*(.*))?$/i);
		if (!field) continue;
		let value = field[2] ?? "";
		if (value === "|" || value === ">") {
			const parts = [];
			while (index + 1 < lines.length && /^\s+/.test(lines[index + 1])) {
				parts.push(lines[index += 1].trim());
			}
			value = parts.join(value === ">" ? " " : "\n");
		}
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1);
		}
		fields[field[1]] = value;
	}
	return fields;
}

async function checkReference(skillRoot, file, rawTarget, index, text, violations) {
	let target = rawTarget.trim();
	if (target.startsWith("<")) target = target.slice(1, target.indexOf(">"));
	else target = target.split(/\s+/)[0];
	if (!target || target.startsWith("#")) return;
	target = target.split("#")[0].split("?")[0];
	try { target = decodeURIComponent(target); } catch { /* reported as missing below */ }
	const location = `${file.path}:${lineAt(text, index)}`;
	if (/^file:/i.test(target)) {
		try {
			const localPath = fileURLToPath(target);
			if (isAbsolute(localPath) || win32.isAbsolute(localPath) || localPath.startsWith("\\")) {
				violations.push(violation("reference-escape", location, "File URL references must not resolve to local absolute paths."));
				return;
			}
		} catch {
			violations.push(violation("reference-escape", location, "File URL references must be portable local paths."));
			return;
		}
	}
	if (isAbsolute(target) || win32.isAbsolute(target) || target.startsWith("\\")) {
		violations.push(violation("reference-escape", location, "Local references must be relative to the skill."));
		return;
	}
	if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return;
	target = target.replaceAll("\\", "/");
	const resolved = resolve(dirname(file.absolutePath), target);
	if (!contained(skillRoot, resolved)) {
		violations.push(violation("reference-escape", location, "Local references must remain inside the skill."));
		return;
	}
	try {
		const stats = await lstat(resolved);
		if (stats.isSymbolicLink()) throw new Error("link");
	} catch {
		violations.push(violation("missing-reference", location, "Referenced local resource is missing or unsafe."));
	}
}

function checkToolReferences(text, displayPath, violations) {
	const references = new Map();
	const addReference = (index, name) => references.set(`${lineAt(text, index)}\0${name}`, { index, name });
	for (const match of text.matchAll(KNOWN_NON_ANTIGRAVITY_TOOLS)) addReference(match.index, match[0].toLowerCase());
	KNOWN_NON_ANTIGRAVITY_TOOLS.lastIndex = 0;
	for (const match of text.matchAll(/`([a-z][a-z0-9_]*(?:__[a-z0-9_]+)?)(?:\([^`\r\n]*\))?`/gi)) {
		if (match[1].includes("__")) addReference(match.index, match[1].toLowerCase());
	}
	for (const { index, name } of [...references.values()].sort((left, right) => left.index - right.index)) {
		if (!TOOL_SET.has(name)) violations.push(violation(
			"unsupported-tool",
			`${displayPath}:${lineAt(text, index)}`,
			`Tool reference '${name}' is outside the exact Antigravity catalog.`,
		));
	}
}

async function lintSkill(skillsRoot, name, violations) {
	const skillRoot = resolve(skillsRoot, name);
	if (!contained(resolve(skillsRoot), skillRoot)) {
		violations.push(violation("skill-path", `${name}:1`, "Skill path escaped the active root."));
		return;
	}
	let entries;
	try { entries = await walkTree(skillRoot); }
	catch {
		violations.push(violation("skill-tree", `${name}:1`, "Skill is missing or contains a link/non-regular entry."));
		return;
	}
	const main = entries.find(({ path }) => path === "SKILL.md");
	if (!main) {
		violations.push(violation("skill-metadata", `${name}/SKILL.md:1`, "SKILL.md is required."));
		return;
	}
	const mainText = decodeText(main.buffer, `${name}/SKILL.md`, violations, true);
	if (mainText !== null) {
		const metadata = parseFrontmatter(mainText);
		if (!metadata) violations.push(violation("skill-metadata", `${name}/SKILL.md:1`, "YAML frontmatter must begin at byte zero."));
		else {
			if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.name ?? "") || metadata.name !== name) {
				violations.push(violation("skill-name", `${name}/SKILL.md:2`, "Skill name must equal its lowercase hyphenated folder name."));
			}
			if (typeof metadata.description !== "string" || metadata.description.trim() === "") {
				violations.push(violation("skill-description", `${name}/SKILL.md:1`, "A nonempty description is required."));
			}
		}
	}
	for (const file of entries) {
		const displayPath = `${name}/${file.path}`;
		const text = decodeText(file.buffer, displayPath, violations, file.path === "SKILL.md");
		if (text === null) continue;
		for (const pattern of FORBIDDEN) {
			const match = pattern.exec(text);
			pattern.lastIndex = 0;
			if (match) violations.push(violation("forbidden-surface", `${displayPath}:${lineAt(text, match.index)}`, "Codex/OpenCode-specific surfaces are forbidden in active skills."));
		}
		checkToolReferences(text, displayPath, violations);
		if (extname(file.path).toLowerCase() !== ".md") continue;
		for (const match of text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
			await checkReference(skillRoot, { ...file, path: displayPath }, match[1], match.index, text, violations);
		}
	}
}

async function validate(options) {
	const violations = [];
	const catalogPath = resolve(options.catalog);
	const packageRoot = dirname(dirname(catalogPath));
	const [catalog, modes, tools, hashes] = await Promise.all([
		readJson(catalogPath, "skill catalog", violations),
		readJson(resolve(options.modes), "experimental modes", violations),
		readJson(resolve(options.tools), "tool catalog", violations),
		readJson(resolve(options.hashes), "experimental hash lock", violations),
	]);
	if (catalog) {
		if (!keysEqual(catalog, ["version", "contract", "core", "experimental"]) || catalog.version !== 1
			|| !keysEqual(catalog.contract, ["path", "url", "sha256"])
			|| catalog.contract.path !== "contracts/antigravity/skills.md"
			|| catalog.contract.url !== "https://antigravity.google/assets/docs/antigravity-2-0/skills.md"
			|| catalog.contract.sha256 !== "f9edcffbe1758127c68146b072022f597d63767e1cf9397fc6ae7475e7cdd705") {
			violations.push(violation("catalog-contract", `${catalogPath}:1`, "Catalog schema and pinned skills provenance must be exact."));
		}
		const core = catalog.core?.map(({ name }) => name);
		const experimental = catalog.experimental?.map(({ name }) => name);
		if (!arraysEqual(core, CORE) || !arraysEqual(experimental, EXPERIMENTAL)) violations.push(violation("catalog-names", `${catalogPath}:1`, "Core and experimental names must match the fixed 15/19 boundary."));
		const entries = [...(catalog.core ?? []), ...(catalog.experimental ?? [])];
		if (entries.length !== 34 || new Set(entries.map(({ name }) => name)).size !== 34 || entries.some((entry) => !keysEqual(entry, ["name", "reason"]) || typeof entry.reason !== "string" || entry.reason.trim() === "")) violations.push(violation("catalog-entries", `${catalogPath}:1`, "Catalog entries must account for 34 unique names with nonempty reasons."));
		try {
			const contract = await readFile(join(packageRoot, catalog.contract.path));
			if (createHash("sha256").update(contract).digest("hex") !== catalog.contract.sha256) throw new Error("hash");
		} catch { violations.push(violation("contract-hash", `${catalogPath}:1`, "Pinned IDE skills contract bytes do not match the catalog.")); }
	}
	if (!modes || !keysEqual(modes, EXPERIMENTAL) || Object.values(modes).some((mode) => !keysEqual(mode, ["ide", "cli"]) || mode.ide !== "unsupported" || mode.cli !== "unsupported")) violations.push(violation("experimental-modes", `${resolve(options.modes)}:1`, "Every fixed experimental skill must be unsupported on IDE and CLI with no extra fields."));
	if (!tools || !keysEqual(tools, ["version", "contract", "tools"]) || tools.version !== 1
		|| !keysEqual(tools.contract, ["url", "sha256", "section"])
		|| tools.contract.url !== "https://antigravity.google/assets/docs/antigravity-2-0/hooks.md"
		|| tools.contract.sha256 !== "1d42e45b22596bec959521d698ab220a1bb883986a9998fa27a93c560d75849b"
		|| tools.contract.section !== "Supported Tools" || !arraysEqual(tools.tools, TOOLS)
		|| new Set(tools.tools ?? []).size !== 20) violations.push(violation("tool-catalog", `${resolve(options.tools)}:1`, "Tool catalog must contain the exact 20 pinned Supported Tools."));
	let hashCount = 0;
	if (!hashes || !keysEqual(hashes, ["version", "sourceRoot", "algorithm", "baselineFingerprint", "skills"])
		|| hashes.version !== 1 || hashes.sourceRoot !== "experimental-skills"
		|| hashes.algorithm !== "sha256(JSON.stringify(sorted [{path,sha256,bytes}]))"
		|| hashes.baselineFingerprint !== "eded1e97c8e3156dae270427ee1bcda75716b850aca03fdef2d16bcef78eacd3"
		|| !keysEqual(hashes.skills, EXPERIMENTAL)) violations.push(violation("experimental-hashes", `${resolve(options.hashes)}:1`, "Hash lock must contain the exact baseline schema and 19 experimental skills."));
	else for (const name of EXPERIMENTAL) {
		try {
			const actual = treeReceipt(await walkTree(join(packageRoot, hashes.sourceRoot, name)));
			if (JSON.stringify(actual) !== JSON.stringify(hashes.skills[name])) throw new Error("mismatch");
			hashCount += 1;
		} catch { violations.push(violation("experimental-byte-drift", `${hashes.sourceRoot}/${name}:1`, "Experimental skill bytes differ from the pre-edit hash lock.")); }
	}
	const selected = options.skills.length > 0 ? options.skills : options.skillsRoot ? CORE : [];
	if (options.json && selected.length === 0) violations.push(violation("active-selection", "arguments:1", "--json receipts require at least one active skill subject."));
	if (options.skills.length > 0 && !options.skillsRoot) violations.push(violation("active-selection", "arguments:1", "--skill requires --skills-root."));
	if (new Set(selected).size !== selected.length || selected.some((name) => !CORE.includes(name))) violations.push(violation("active-selection", "arguments:1", "Only unique approved core skills may be linted as active."));
	if (options.skillsRoot) for (const name of selected) await lintSkill(resolve(options.skillsRoot), name, violations);
	violations.sort((left, right) => `${left.location}\0${left.code}`.localeCompare(`${right.location}\0${right.code}`, "en"));
	return {
		task: 4,
		status: violations.length === 0 ? "passed" : "failed",
		coreCount: catalog?.core?.length ?? 0,
		experimentalCount: catalog?.experimental?.length ?? 0,
		experimentalHashCount: hashCount,
		toolCount: tools?.tools?.length ?? 0,
		activeSkillsChecked: selected,
		assertionIds: [
			"skills.contract.pinned", "skills.catalog.exact-boundary",
			"skills.experimental.byte-preserved", "skills.linter.metadata-references-tools",
			"skills.linter.forbidden-file-line",
		],
		violations,
	};
}

async function main() {
	let options;
	let report;
	try {
		options = parseArgs(process.argv.slice(2));
		report = await validate(options);
	} catch {
		report = { task: 4, status: "failed", violations: [violation("internal-error", "arguments:1", "Skill portability check could not run.")] };
	}
	const output = `${JSON.stringify(report, null, 2)}\n`;
	if (options?.json) {
		try {
			await mkdir(dirname(resolve(options.json)), { recursive: true });
			await writeFile(resolve(options.json), output, "utf8");
		} catch (error) {
			const message = error instanceof Error ? error.message.slice(0, 300) : "unknown write failure";
			report = {
				task: 4,
				status: "failed",
				violations: [violation("json-write", "arguments:1", `Could not write JSON report: ${message}`)],
			};
			process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
			process.stderr.write("skill portability check failed (json-write).\n");
			process.exitCode = 1;
			return;
		}
	}
	process.stdout.write(output);
	if (report.status !== "passed") {
		process.stderr.write(`skill portability check failed (${report.violations.length} violation(s)).\n`);
		process.exitCode = 1;
	}
}

await main();
