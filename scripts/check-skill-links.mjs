#!/usr/bin/env node
// check-skill-links.mjs — verify every relative markdown link inside the
// materialized skills tree resolves to a real file. Catches dangling
// doc-references (e.g. a `frontend-refs-manifest.mjs` that was never shipped)
// which static review mistakes for shipped tooling.
//
//   node scripts/check-skill-links.mjs [skillsRoot] [--json]
//
// Exit 0 when clean; exit 1 listing every dangling target otherwise.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot =
	process.env.PLUGIN_ROOT?.trim() ||
	join(dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2).filter((a) => a !== "--json");
const jsonMode = process.argv.includes("--json");
const skillsRoot = resolve(args[0] ?? join(pluginRoot, "skills"));

// [text](target) — skip anchors, absolute URLs, mailto, and ${VAR}/$VAR paths
// (those resolve at runtime, not on disk).
const LINK_RE = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

function* walk(dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) yield* walk(full);
		else if (entry.name.endsWith(".md")) yield full;
	}
}

function isSkippable(target) {
	return (
		target.startsWith("#") ||
		/^[a-z][a-z0-9+.-]*:/i.test(target) || // http:, mailto:, etc.
		target.startsWith("/") ||
		target.includes("${") ||
		target.includes("$") ||
		// Bare tokens with no path separator and no file extension are prose
		// placeholders or code syntax the link regex caught ([label](url),
		// Stream[T](max_buffer_size=N)) — not file references.
		(!target.includes("/") && !/\.[a-z0-9]+$/i.test(target.split("#")[0]))
	);
}

export function findDanglingLinks(root) {
	const dangling = [];
	if (!existsSync(root)) return dangling;
	for (const file of walk(root)) {
		const content = readFileSync(file, "utf8");
		for (const match of content.matchAll(LINK_RE)) {
			const raw = match[1];
			if (isSkippable(raw)) continue;
			const target = raw.split("#")[0];
			if (target === "") continue;
			const resolved = resolve(dirname(file), decodeURIComponent(target));
			if (!existsSync(resolved)) {
				dangling.push({ file, link: raw, resolved });
			}
		}
	}
	return dangling;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
	const dangling = findDanglingLinks(skillsRoot);
	if (jsonMode) {
		process.stdout.write(`${JSON.stringify({ root: skillsRoot, dangling }, null, 1)}\n`);
	} else {
		for (const d of dangling) {
			process.stdout.write(`dangling: ${d.file} -> ${d.link}\n`);
		}
		if (dangling.length === 0) {
			process.stdout.write(`check-skill-links: all relative links under ${skillsRoot} resolve\n`);
		}
	}
	process.exit(dangling.length === 0 ? 0 : 1);
}
