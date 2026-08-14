#!/usr/bin/env node

const format = "lazyantigravity-oss-icons-report.v1";
const product = "LazyAntigravity";

const candidates = [
	{
		id: "reicon",
		package: "reicon",
		homepage: "https://reicon.dev",
		repository: "https://github.com/dqev/reicon",
		icon_count_claim: "2,680+ npm package claim / 2,700+ upstream README and Marketplace claim",
		weights: ["Outline", "Filled"],
		packages: {
			core: {
				name: "reicon",
				version: "1.0.0",
				description: "Vanilla JS SVG icon functions for 2680+ icons in 2 weights (Outline & Filled). Zero dependencies, tree-shakeable, TypeScript-ready.",
			},
			react: {
				name: "reicon-react",
				version: "1.1.2",
				description: "React icon components for 2680+ icons in 2 weights (Outline & Filled). Tree-shakeable, TypeScript-ready.",
			},
			vue: {
				name: "reicon-vue",
				version: "1.1.2",
				description: "Vue 3 icon components for 2680+ icons in 2 weights (Outline & Filled). Tree-shakeable, TypeScript-ready.",
			},
			svelte: {
				name: "reicon-svelte",
				version: "1.0.0",
				description: "Svelte icon components for 2680+ icons in 2 weights (Outline & Filled). Tree-shakeable, TypeScript-ready.",
			},
			vscode: {
				name: "DevChauhan.reicon",
				version: "1.0.3",
				description: "VS Code Marketplace extension for browsing, searching, and inserting Reicon SVG icons.",
			},
		},
		license: {
			user_term: "MI",
			normalized: "MIT",
			official: "MIT",
			caveat: "The user's MI wording is treated as a likely MIT typo because official npm, GitHub, site, and Marketplace metadata all report MIT.",
		},
		supply_chain: {
			published_window: "June 2026 package family",
			core_package_size_bytes: 12830968,
			core_unpacked_size_bytes: 49875767,
			core_entry_count: 5369,
			core_integrity: "sha512-ldGnVVU4HxNVG3W/r9YeiADMfatAt1kM9C4D5CTbS4EgPzXN/mmO7aYPWj2Z4oxAn6foaFnzgAMSy0rNrqCJ9Q==",
			core_shasum: "3af016c37e7c69fd8c6b809f1ad2650d710a91f0",
		},
		integration_points: [
			{
				id: "oss-icons-report",
				status: "added",
				rationale: "LazyAntigravity already exposes local report commands for claim verification; this keeps Reicon review evidence rerunnable without adding a runtime dependency.",
			},
			{
				id: "docs-reference",
				status: "candidate",
				rationale: "A future docs page can consume this static recommendation if LazyAntigravity needs human-facing icon sourcing guidance.",
			},
			{
				id: "runtime-dependency",
				status: "deferred",
				rationale: "No current LazyAntigravity runtime icon consumer requires Reicon, and direct icon redistribution needs upstream provenance review.",
			},
		],
		recommendation: {
			status: "add-report-now",
			summary: "Track Reicon as a reviewed OSS icon candidate through LazyAntigravity's report surface; defer runtime adoption until a concrete UI call site and attribution plan exist.",
		},
		risk_notes: [
			"Reicon package metadata is MIT, but the upstream README credits Solar Icons under CC BY 4.0 and Zappicon License; review attribution before vendoring or redistributing icons.",
			"The project and package family are recent, so pin exact package versions and inspect package contents before runtime adoption.",
			"The core npm package is large enough to require tree-shaken imports and package-size review if it ever becomes a dependency.",
		],
		sources: [
			{
				label: "GitHub README",
				url: "https://github.com/dqev/reicon",
				observed: "MIT license badge, 2,700+ icon claim, integration package list, and upstream credits.",
			},
			{
				label: "npm reicon",
				url: "https://www.npmjs.com/package/reicon",
				observed: "version 1.0.0, MIT license, zero-dependency vanilla SVG icon functions.",
			},
			{
				label: "npm reicon-react",
				url: "https://www.npmjs.com/package/reicon-react",
				observed: "version 1.1.2, MIT license, React package metadata.",
			},
			{
				label: "npm reicon-vue",
				url: "https://www.npmjs.com/package/reicon-vue",
				observed: "version 1.1.2, MIT license, Vue package metadata.",
			},
			{
				label: "npm reicon-svelte",
				url: "https://www.npmjs.com/package/reicon-svelte",
				observed: "version 1.0.0, MIT license, Svelte package metadata.",
			},
			{
				label: "VS Code Marketplace",
				url: "https://marketplace.visualstudio.com/items?itemName=DevChauhan.reicon",
				observed: "extension version 1.0.3, MIT license, editor insertion workflow.",
			},
		],
	},
];

function main() {
	const options = parseArgs(process.argv.slice(2));
	const candidate = candidates.find((item) => item.id === options.candidate);
	if (!candidate) {
		process.stderr.write(`Unknown candidate: ${options.candidate}\n`);
		process.exitCode = 1;
		return;
	}
	const report = buildReport(candidate);
	if (options.json) {
		process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
		return;
	}
	process.stdout.write(toMarkdown(report));
}

export function buildReport(candidate = candidates[0]) {
	return {
		format,
		product,
		generated_at: new Date().toISOString(),
		source_policy: "Static review data is copied from official source snapshots and does not install or fetch packages at runtime.",
		summary: {
			total: 1,
			recommended_now: ["oss-icons-report"],
			deferred: ["runtime-dependency"],
		},
		candidates: [candidate],
	};
}

function parseArgs(args) {
	const options = { candidate: "reicon", json: false };
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--json") {
			options.json = true;
		} else if (arg === "--candidate") {
			const value = args[index + 1];
			if (!value || value.startsWith("--")) throw new Error("Usage: node scripts/lazyantigravity-oss-icons-report.mjs [--json] [--candidate reicon]");
			options.candidate = value;
			index += 1;
		} else if (arg === "--help" || arg === "-h") {
			process.stdout.write("Usage: node scripts/lazyantigravity-oss-icons-report.mjs [--json] [--candidate reicon]\n");
			process.exit(0);
		} else {
			throw new Error("Usage: node scripts/lazyantigravity-oss-icons-report.mjs [--json] [--candidate reicon]");
		}
	}
	return options;
}

function toMarkdown(report) {
	const candidate = report.candidates[0];
	const lines = [
		"# LazyAntigravity OSS Icons Report",
		"",
		`Format: ${report.format}`,
		`Candidate: ${candidate.id}`,
		`License: ${candidate.license.normalized}`,
		`Recommendation: ${candidate.recommendation.status}`,
		"",
		"## Integration Points",
		"",
	];
	for (const point of candidate.integration_points) {
		lines.push(`- ${point.status}: ${point.id} - ${point.rationale}`);
	}
	lines.push("", "## Risks", "");
	for (const note of candidate.risk_notes) {
		lines.push(`- ${note}`);
	}
	return `${lines.join("\n")}\n`;
}

try {
	if (process.argv[1]?.endsWith("lazyantigravity-oss-icons-report.mjs")) {
		main();
	}
} catch (error) {
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 1;
}
