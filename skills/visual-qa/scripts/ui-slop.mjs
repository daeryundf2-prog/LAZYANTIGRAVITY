#!/usr/bin/env node
// Review-only UI "slop" signature scan. Prints candidates for a human or Pass A reviewer; it never fails a run.
// Rule signatures adapted from hypercore (MIT, alpoxdev) skills/hyper-design/scripts/rule-registry.sh; see NOTICE.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_BYTES = 200_000;
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", ".next"]);
const CSS_EXT = new Set([".css", ".scss", ".less", ".html", ".htm", ".vue", ".svelte", ".astro", ".jsx", ".tsx", ".js", ".ts"]);
const MARKUP_EXT = new Set([".html", ".htm", ".vue", ".svelte", ".astro", ".jsx", ".tsx", ".php"]);
const TEXT_EXT = new Set([...CSS_EXT, ".md", ".mdx", ".txt"]);
const ENGINE_EXT = { css: CSS_EXT, markup: MARKUP_EXT, text: TEXT_EXT };

const rule = (id, severity, kind, engine, keepWhen, advice, re, extra = {}) => ({ id, severity, kind, engine, keepWhen, advice, re, ...extra });

export const RULES = [
	rule("surface.gradient-text", "P2", "default-risk", "css", "explicit brand gradient", "Use a solid token unless the brand or reference requires gradient type.", /(?:background-clip\s*:\s*text|-webkit-background-clip\s*:\s*text|bg-clip-text)/gi),
	rule("surface.purple-gradient", "P2", "default-risk", "css", "explicit brand gradient", "Keep documented brand gradients; otherwise review a solid token.", /(?:purple|violet|fuchsia|#(?:7c3aed|8b5cf6|a855f7|c026d3)).{0,100}(?:blue|pink|cyan|#(?:2563eb|3b82f6|ec4899))/gi),
	rule("motion.transition-all", "P2", "universal", "css", "", "List only the properties that actually change.", /(?:transition\s*:\s*all\b|\btransition-all\b)/gi),
	rule("motion.layout-property", "P1", "universal", "css", "", "Prefer transform/opacity when behavior stays equivalent.", /(?:transition(?:-property)?\s*:[^;]*(?:top|left|width|height|margin|padding)|(?:animate|transition)[\w:-]*\([^)]*(?:top|left|width|height|margin|padding))/gi),
	rule("surface.thick-side-stripe", "P2", "default-risk", "css", "", "Keep only if the stripe carries state or brand meaning.", /border-(?:left|inline-start)(?:-width)?\s*:\s*(?:[5-9]|\d{2,})px|\bborder-l-(?:4|8)\b/gi),
	rule("surface.thin-side-stripe", "P2", "default-risk", "css", "", "Keep only if the stripe carries state or brand meaning.", /border-(?:left|right|inline-start|inline-end)(?:-width)?\s*:\s*(?:1|2|3|4)px|\bborder-[lr]-(?:1|2|3)\b/gi),
	rule("surface.pseudo-stripe", "P2", "default-risk", "css", "", "Keep only if the bar carries state or brand meaning.", /::(?:before|after)[^{]{0,80}\{[^}]{0,500}((?:width|height)\s*:\s*[1-6]px[^}]{0,400}background(?:-color)?\s*:\s*(?:#[0-9a-f]{3,8}|rgba?\()|background(?:-color)?\s*:\s*(?:#[0-9a-f]{3,8}|rgba?\()[^}]{0,400}(?:width|height)\s*:\s*[1-6]px)/gi),
	rule("surface.inset-stripe", "P2", "default-risk", "css", "", "Keep only if the edge shadow carries state or brand meaning.", /box-shadow\s*:\s*inset\s+(?:0\s+[-]?[1-9]px|[-]?[1-9]px\s+0)(?:\s+(?:0|\d+px))?\s+(?:#[0-9a-f]{3,8}|rgba?\([^)]*\)|[a-z]{3,})/gi),
	rule("surface.gradient-border-image", "P2", "default-risk", "css", "", "Keep only if the border carries state or brand meaning.", /border-image(?:-source)?\s*:\s*[^;{}]{0,200}linear-gradient\(/gi),
	rule("surface.hard-stop-band", "P2", "default-risk", "css", "", "Keep only if the band carries state or brand meaning.", /linear-gradient\([^;{}]*\b(?:2|3|4|5|6|7|8)px\b[^;{}]*\b(?:2|3|4|5|6|7|8)px\b/gi),
	rule("structure.card-in-card", "P2", "default-risk", "markup", "", "Check the DOM nesting; keep semantic groups.", /class(?:Name)?\s*=\s*["'`][^"'`]*\bcard\b[^"'`]*["'`][\s\S]{0,500}class(?:Name)?\s*=\s*["'`][^"'`]*\bcard\b/gi),
	rule("quality.fake-chrome", "P2", "default-risk", "text", "", "Keep chrome that frames a real product asset.", /(?:fake|mock)[-_ ]?(?:browser|phone|terminal|ide)|(?:browser|phone|terminal|ide)[-_ ]?chrome/gi),
	rule("copy.placeholder-person", "P1", "default-risk", "text", "", "Remove unless it is a documented fixture or test value.", /\b(?:John Doe|Jane Doe|Lorem Ipsum)\b/gi),
	rule("copy.placeholder-brand", "P1", "default-risk", "text", "", "Confirm it is not the real product or a deliberate fixture.", /\b(?:Acme|SmartFlow|Nexus AI)\b/gi),
	rule("copy.cliche", "P3", "context-dependent", "text", "", "Compare with the product voice; do not rewrite sourced copy.", /\b(?:Elevate|Seamless(?:ly)?|Next-gen|Next[- ]generation|Unleash|Game-changer|Supercharge|Cutting[- ]edge|Revolutionary|AI[- ]powered|Effortless(?:ly)?)\b/gi),
	rule("copy.unsupported-metric", "P1", "default-risk", "text", "", "Require local provenance; never invent a replacement number.", /\b(?:\d{2,}(?:\.\d+)?%|\d+x)\s+(?:faster|better|growth|uptime|increase|improvement|more)\b/gi),
	rule("motion.scale-everywhere", "P2", "default-risk", "text", "", "Keep scaling only when it signals hierarchy or interaction.", /\bhover:(?:scale-(?:105|110)|transform[^\s"'`]*)\b/gi),
	rule("structure.three-equal-cards", "P1", "context-dependent", "text", "pricing or comparison data", "Keep real three-peer comparisons and required cardinality.", /\b(?:grid-cols-3|repeat\(\s*3\s*,\s*(?:1fr|minmax\(0,\s*1fr\))\s*\))/gi),
	rule("surface.decorative-orb", "P2", "default-risk", "text", "", "Remove only when no semantic, brand, state or interaction role exists.", /(?:decorative|floating|gradient)[-_ ]?(?:orb|blob)|\b(?:orb|blob)[-_ ]?(?:decoration|glow)\b/gi),
	rule("surface.status-dot", "P3", "default-risk", "text", "recording, live, sync, unread state", "Keep the dot only if it shows a real state.", /(?:decorative|pulse|status)[-_ ]?dot/gi),
	rule("surface.version-label", "P3", "default-risk", "text", "", "Keep real release or version information.", /(?:version|release)[-_ ]?(?:badge|pill|label)|\bv\d+(?:\.\d+)+\b/gi),
	rule("quality.missing-alt", "P1", "universal", "markup", "", "Decide whether the image is informative or decorative before adding alt.", /<img\b(?![^>]*\balt\s*=)[^>]*>/gi),
	rule("quality.focus-suppressed", "P1", "universal", "css", "", "Confirm an equally visible focus-visible style replaces it.", /(?:outline\s*:\s*(?:none|0)|\bfocus:outline-none\b)/gi),
	rule("structure.repeated-eyebrow", "P3", "review-only", "markup", "", "Keep labels that carry real hierarchy or sequence.", /(?:class(?:Name)?\s*=\s*["'`][^"'`]*(?:eyebrow|kicker)[^"'`]*["'`])/gi),
	rule("structure.numbered-section-label", "P3", "context-dependent", "markup", "", "Keep numbers when the reader needs the sequence.", /(?:class(?:Name)?\s*=\s*["'`][^"'`]*(?:section-number|step-number)[^"'`]*["'`][^>]*>\s*0?[1-9]\b)|\b0[1-9]\s*<\/[^>]+>\s*<h[2-6]/gi),
	rule("structure.identical-icon-card-cluster", "P2", "context-dependent", "markup", "", "Keep real peer data; otherwise try a task-ordered layout.", /(?=(?:[\s\S]*feature-card){3})(?=(?:[\s\S]*icon-tile){3})[\s\S]*/gi, { requires: ["feature-card", "icon-tile"] }),
	rule("surface.radial-glow", "P3", "review-only", "css", "", "Keep purposeful lighting or brand material.", /radial-gradient\([^;}]*(?:transparent|rgba?\()/gi),
	rule("surface.grid-background", "P3", "review-only", "css", "", "Keep a real map, canvas, blueprint or measuring surface.", /(?:linear-gradient\([^;}]*){2}[\s\S]{0,160}background-size/gi),
	rule("surface.border-plus-wide-shadow", "P3", "context-dependent", "css", "", "Keep a documented elevation system.", /border\s*:[^;}]+;[\s\S]{0,200}box-shadow\s*:\s*0\s+(?:1[6-9]|[2-9]\d)px/gi),
	rule("type.decorative-monospace", "P3", "default-risk", "text", "", "Reserve monospace for code, IDs, logs, measurements, system state.", /(?:font-mono|font-family\s*:\s*[^;}]*monospace)[\s\S]{0,160}(?:kicker|future|platform|work)/gi),
	rule("motion.pulse-without-state", "P2", "default-risk", "css", "real state label", "Keep pulse only for recording, sync, notification or live state.", /animation\s*:\s*[^;}]*pulse|@keyframes\s+pulse/gi),
	rule("motion.missing-reduced-motion", "P1", "universal", "motion-context", "", "Check project-wide reduced-motion handling before adding a scoped fallback.", /(?:transition|animation)\s*:|@keyframes\b/i),
	rule("quality.heading-skip", "P2", "universal", "markup", "", "Use a semantic heading order; confirm component composition first.", /<h1\b[\s\S]{0,500}<h3\b/gi),
	rule("quality.zoom-blocked", "P1", "universal", "markup", "", "Remove user-scalable=no / maximum-scale=1 so zoom reaches 200%.", /<meta\b[^>]*(?:user-scalable\s*=\s*(?:no|0)\b|maximum-scale\s*=\s*1(?:\.0+)?\b)[^>]*>/gi),
	rule("quality.clickable-div", "P1", "universal", "markup", "", "Use a button for actions or an anchor with a real href; keep keyboard support.", /<(?:div|span)\b[^>]*\bon(?:click|Click)\s*=/g),
	rule("quality.dead-anchor", "P2", "universal", "markup", "", "Point at a real target, use a button, or remove the control.", /\bhref\s*=\s*(?:"#"|'#'|\{\s*["']#["']\s*\})/g),
	rule("quality.media-unsized", "P2", "universal", "markup", "", "Give intrinsic width and height or an aspect-ratio to stop layout shift.", /<(?:img|video|iframe)\b(?![^>]*\b(?:width|height)\s*=)(?![^>]*aspect-ratio)[^>]*>/gi),
	rule("copy.em-dash", "P3", "default-risk", "text", "owner voice sample", "Rewrite with a period, comma, colon or parentheses.", /&(?:mdash|#8212);|\u2014/g),
	rule("copy.generic-cta", "P3", "context-dependent", "markup", "", "Name the action and its result in the product's words.", />\s*(?:Get started|Learn more|Try (?:it )?now|Explore|Discover)\s*(?:&rarr;|\u2192)?\s*</gi),
	rule("structure.viewport-height", "P3", "context-dependent", "css", "", "Let the section size to its content, or use dvh when it must fill the screen.", /\b100vh\b|\b(?:min-)?h-screen\b/g),
];

const MAX_PER_RULE = 5;
const lineOf = (text, index) => text.slice(0, index).split("\n").length;
const excerpt = (s) => s.replace(/\s+/g, " ").trim().slice(0, 120);

export function scanText(text, ext = ".html") {
	const findings = [];
	for (const r of RULES) {
		if (r.engine === "motion-context") {
			const m = r.re.exec(text);
			if (m && !/prefers-reduced-motion/i.test(text)) findings.push({ rule: r.id, line: lineOf(text, m.index), excerpt: excerpt(m[0]), severity: r.severity, kind: r.kind, keepWhen: r.keepWhen, advice: r.advice });
			continue;
		}
		if (!ENGINE_EXT[r.engine]?.has(ext)) continue;
		if (r.requires && !r.requires.every((s) => text.includes(s))) continue;
		let count = 0;
		for (const m of text.matchAll(r.re)) {
			findings.push({ rule: r.id, line: lineOf(text, m.index), excerpt: excerpt(m[0]), severity: r.severity, kind: r.kind, keepWhen: r.keepWhen, advice: r.advice });
			if (++count >= MAX_PER_RULE) break;
		}
	}
	return findings.sort((a, b) => a.line - b.line);
}

function collect(path, out, skipped) {
	const st = statSync(path);
	if (st.isDirectory()) {
		for (const name of readdirSync(path)) if (!SKIP_DIRS.has(name)) collect(join(path, name), out, skipped);
		return;
	}
	if (!TEXT_EXT.has(extname(path))) return;
	if (st.size > MAX_BYTES) skipped.push({ file: path, reason: `larger than ${MAX_BYTES} bytes` });
	else out.push(path);
}

export function scanPaths(paths) {
	const files = [];
	const skipped = [];
	for (const p of paths) collect(p, files, skipped);
	const findings = [];
	for (const file of files) {
		for (const f of scanText(readFileSync(file, "utf8"), extname(file))) findings.push({ file, ...f });
	}
	return { reviewOnly: true, filesScanned: files.length, skipped, findings };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const paths = process.argv.slice(2);
	if (paths.length === 0) {
		console.error("usage: node ui-slop.mjs <file|dir> [...]");
		process.exit(2);
	}
	console.log(JSON.stringify(scanPaths(paths), null, 2));
}
