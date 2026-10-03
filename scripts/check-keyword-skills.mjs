#!/usr/bin/env node
// check-keyword-skills.mjs — verify every `$name` referenced by a
// <keyword_detection> table resolves to something real in this repo.
//
// Resolution tiers (weakest truthful claim first):
//   aggregate-skill   skills/<name>/SKILL.md                          pass
//   component-skill   components/*/skills/<name>/SKILL.md             pass
//   component-package components/<name>/package.json (runtime, not a skill) warn
//   reference         <name>.md under any skill's references/         warn
//   dangling          nothing found                                   fail
//
// Usage:
//   node scripts/check-keyword-skills.mjs [AGENTS.md ...] [--json]
// With no paths, checks <repo>/AGENTS.md only.

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const json = args.includes("--json");
const targets = args.filter((a) => !a.startsWith("-"));
const agentsPaths = targets.length > 0 ? targets : [join(repoRoot, "AGENTS.md")];

function extractSkillRefs(content) {
	const block = content.match(/<keyword_detection>([\s\S]*?)<\/keyword_detection>/);
	const scope = block ? block[1] : content;
	const rows = scope
		.split("\n")
		.filter((line) => line.trimStart().startsWith("|") && /\$[A-Za-z][\w-]*/.test(line));
	const refs = [];
	for (const row of rows) {
		for (const match of row.matchAll(/\$([A-Za-z][\w-]*)/g)) {
			refs.push({ name: match[1], row: row.trim().slice(0, 100) });
		}
	}
	return refs;
}

// Extract the quoted trigger literals from column 1 of each table row so
// duplicate keywords routed to different skills surface as ambiguous.
function extractKeywordCollisions(content) {
	const block = content.match(/<keyword_detection>([\s\S]*?)<\/keyword_detection>/);
	if (!block) return [];
	const rows = block[1]
		.split("\n")
		.filter((line) => line.trimStart().startsWith("|") && !/^\s*\|[\s-:|]+\|?\s*$/.test(line));
	const seen = new Map(); // keyword -> row targets
	const collisions = [];
	for (const row of rows) {
		const cells = row.split("|").map((c) => c.trim()).filter(Boolean);
		if (cells.length < 2) continue;
		const targets = [...row.matchAll(/\$([A-Za-z][\w-]*)/g)].map((m) => m[1]);
		for (const m of cells[0].matchAll(/"([^"]+)"/g)) {
			const keyword = m[1].trim().toLowerCase();
			if (!keyword) continue;
			if (seen.has(keyword)) {
				const first = seen.get(keyword);
				collisions.push({ keyword, first, second: { targets, row: row.trim().slice(0, 100) } });
			} else {
				seen.set(keyword, { targets, row: row.trim().slice(0, 100) });
			}
		}
	}
	return collisions;
}

function* walk(dir, depth = 0) {
	if (depth > 6) return;
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		const full = join(dir, entry.name);
		let isDir = entry.isDirectory();
		if (!isDir && entry.isSymbolicLink()) {
			try {
				isDir = statSync(full).isDirectory();
			} catch {}
		}
		if (isDir && !entry.name.startsWith(".") && entry.name !== "node_modules" && entry.name !== ".venv") {
			yield full;
			yield* walk(full, depth + 1);
		}
	}
}

function buildIndex(root) {
	const skillsIndex = new Map(); // name -> path
	const referenceIndex = new Map(); // name -> path
	const searchRoots = [root];
	const pluginsParent = dirname(root);
	if (existsSync(pluginsParent)) {
		for (const entry of readdirSync(pluginsParent, { withFileTypes: true })) {
			if (!entry.name.startsWith(".") && entry.name !== basename(root)) {
				const full = join(pluginsParent, entry.name);
				try {
					if (statSync(full).isDirectory()) searchRoots.push(full);
				} catch {}
			}
		}
	}

	for (const r of searchRoots) {
		for (const dir of [join(r, "skills"), join(r, "shared-skills", "skills"), ...componentSkillDirs(r)]) {
			if (!existsSync(dir)) continue;
			for (const entry of readdirSync(dir, { withFileTypes: true })) {
				const entryPath = join(dir, entry.name);
				let isDir = entry.isDirectory();
				if (!isDir && entry.isSymbolicLink()) {
					try {
						isDir = statSync(entryPath).isDirectory();
					} catch {}
				}
				if (!isDir) continue;
				const manifest = join(dir, entry.name, "SKILL.md");
				if (existsSync(manifest) && !skillsIndex.has(entry.name)) {
					skillsIndex.set(entry.name, manifest);
				}
				const refsRoot = join(dir, entry.name, "references");
				if (!existsSync(refsRoot)) continue;
				for (const refDir of [refsRoot, ...walk(refsRoot)]) {
					for (const f of readdirSync(refDir, { withFileTypes: true })) {
						if (f.isFile() && f.name.endsWith(".md")) {
							const key = f.name.replace(/\.md$/, "");
							if (!referenceIndex.has(key)) referenceIndex.set(key, join(refDir, f.name));
						}
					}
				}
			}
		}
	}
	const componentIndex = new Map();
	const componentsDir = join(root, "components");
	if (existsSync(componentsDir)) {
		for (const entry of readdirSync(componentsDir, { withFileTypes: true })) {
			if (entry.isDirectory() && existsSync(join(componentsDir, entry.name, "package.json"))) {
				componentIndex.set(entry.name, join(componentsDir, entry.name));
			}
		}
	}
	return { skillsIndex, referenceIndex, componentIndex };
}

function componentSkillDirs(root) {
	const out = [];
	const componentsDir = join(root, "components");
	if (!existsSync(componentsDir)) return out;
	for (const entry of readdirSync(componentsDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const skillsDir = join(componentsDir, entry.name, "skills");
		if (existsSync(skillsDir)) out.push(skillsDir);
	}
	return out;
}

const index = buildIndex(repoRoot);
const report = { checked_files: [], results: [], dangling: 0, warnings: 0 };

for (const agentsPath of agentsPaths) {
	const abs = resolve(agentsPath);
	if (!existsSync(abs)) {
		report.results.push({ file: agentsPath, ref: null, status: "missing-file", detail: "AGENTS.md not found" });
		report.dangling += 1;
		continue;
	}
	const content = readFileSync(abs, "utf8");
	const refs = extractSkillRefs(content);
	report.checked_files.push({ file: abs, refs: refs.length });
	if (refs.length === 0) {
		report.results.push({ file: agentsPath, ref: null, status: "no-table", detail: "no keyword_detection rows found" });
		report.warnings += 1;
	}
	for (const collision of extractKeywordCollisions(content)) {
		report.results.push({ file: agentsPath, ref: null, status: "keyword-collision", detail: `"${collision.keyword}" maps to ${collision.first.targets.map((t) => `$${t}`).join("+")} and ${collision.second.targets.map((t) => `$${t}`).join("+")}` });
		report.warnings += 1;
	}
	const seen = new Set();
	for (const ref of refs) {
		const key = `${abs}:${ref.name}`;
		if (seen.has(key)) continue;
		seen.add(key);
		const rel = (p) => relative(repoRoot, p);
		if (index.skillsIndex.has(ref.name)) {
			report.results.push({ file: agentsPath, ref: ref.name, status: "aggregate-skill", path: rel(index.skillsIndex.get(ref.name)) });
		} else if (index.referenceIndex.has(ref.name)) {
			report.results.push({ file: agentsPath, ref: ref.name, status: "reference", path: rel(index.referenceIndex.get(ref.name)) });
			report.warnings += 1;
		} else if (index.componentIndex.has(ref.name)) {
			report.results.push({ file: agentsPath, ref: ref.name, status: "component-package", path: rel(index.componentIndex.get(ref.name)) });
			report.warnings += 1;
		} else {
			report.results.push({ file: agentsPath, ref: ref.name, status: "dangling", path: null });
			report.dangling += 1;
		}
	}
}

if (json) {
	console.log(JSON.stringify(report, null, 2));
} else {
	for (const f of report.checked_files) {
		console.log(`${f.file}: ${f.refs} skill refs`);
	}
	for (const r of report.results) {
		const mark = r.status === "dangling" || r.status === "missing-file" ? "FAIL" : r.status === "aggregate-skill" || r.status === "component-skill" ? " ok " : "warn";
		console.log(`[${mark}] $${r.ref ?? "?"} -> ${r.status}${r.path ? ` (${r.path})` : ""}${r.detail ? ` — ${r.detail}` : ""}`);
	}
	console.log(`dangling: ${report.dangling}, warnings: ${report.warnings}`);
}

process.exit(report.dangling > 0 ? 1 : 0);
