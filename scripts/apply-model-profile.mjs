#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
	MARKER_FILES,
	detectEol,
	getMarkerContent,
	renderMarkerContent,
	replaceMarkerBlock,
} from "./lib/model-profile-renderer.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const REASONING_ROLES = ["planner", "verifier", "dual-verify", "hypothesis-tree", "arch-guard"];

const VALUE_FLAGS = { "--display": "display", "--tiers": "tiers", "--context": "context", "--verify-lane": "verifyLane", "--root": "root" };
const VERIFY_LANES = new Set(["pro", "inherit"]);

function usageError(message) {
	console.error(message);
	process.exit(1);
}

function parseArgs(args) {
	let profileName = null;
	const options = {
		display: null,
		tiers: null,
		context: null,
		verifyLane: null,
		root: repoRoot,
		noBuild: false,
		check: false,
	};
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--check") options.check = true;
		else if (arg === "--no-build") options.noBuild = true;
		else if (arg in VALUE_FLAGS) {
			const value = args[i + 1];
			if (value === undefined || value.startsWith("--")) usageError(`${arg} requires a value`);
			if (value.trim() === "") usageError(`${arg} must not be empty`);
			options[VALUE_FLAGS[arg]] = arg === "--root" ? resolve(value) : value;
			i++;
		} else if (arg.startsWith("-")) usageError(`Unknown option '${arg}'`);
		else if (profileName === null) profileName = arg;
		else usageError(`Unexpected argument '${arg}'`);
	}
	if (options.verifyLane && !VERIFY_LANES.has(options.verifyLane)) {
		usageError(`--verify-lane must be one of: ${[...VERIFY_LANES].join(", ")}`);
	}
	if (options.context && !/^[1-9]\d*$/.test(options.context)) usageError("--context must be a positive integer token count");
	return { profileName, options };
}

function updatePostCompactBudget(root, slug, tokens) {
	const budgetPath = join(root, "components", "rules", "src", "post-compact-budget.ts");
	if (!existsSync(budgetPath)) return;
	const content = readFileSync(budgetPath, "utf8");
	if (content.includes(`slug: "${slug}"`)) return;
	const marker = "const MODEL_CONTEXT_BUDGETS: readonly ModelContextBudget[] = [";
	const entry = `\t{ slug: "${slug}", contextWindowTokens: ${tokens}, effectivePercent: 90 },\n`;
	const index = content.indexOf(marker);
	if (index === -1) return;
	const updated = `${content.slice(0, index + marker.length)}\n${entry}${content.slice(index + marker.length)}`;
	writeFileSync(budgetPath, updated);
}

function runCheck(root, catalog, activeProfileName) {
	const antigravity = catalog.antigravity;
	if (!antigravity?.profiles) {
		console.error("Missing antigravity.profiles in model-catalog.json");
		process.exit(1);
	}
	const profile = antigravity.profiles[activeProfileName];
	if (!profile) {
		console.error(`Active profile '${activeProfileName}' not found in catalog.`);
		process.exit(1);
	}
	if (profile.status === "pending") {
		console.error(`Active profile '${activeProfileName}' is pending.`);
		process.exit(1);
	}
	for (const fileInfo of MARKER_FILES) {
		const filePath = join(root, fileInfo.path);
		if (!existsSync(filePath)) {
			console.error(`Missing marker file: ${fileInfo.path}`);
			process.exit(1);
		}
		const content = readFileSync(filePath, "utf8");
		for (const markerId of fileInfo.markers) {
			const current = getMarkerContent(content, markerId);
			if (current === null) {
				console.error(`Missing marker '${markerId}' in ${fileInfo.path}`);
				process.exit(1);
			}
			const expected = renderMarkerContent(markerId, profile, activeProfileName);
			if (current.replace(/\r\n/g, "\n").trim() !== expected.replace(/\r\n/g, "\n").trim()) {
				console.error(`Marker drift detected for '${markerId}' in ${fileInfo.path}`);
				process.exit(1);
			}
		}
	}
	console.log(`[apply-model-profile] Active profile '${activeProfileName}' check passed; no drift.`);
}

function applyProfile(root, profileName, options) {
	const catalogPath = join(root, "model-catalog.json");
	if (!existsSync(catalogPath)) {
		console.error("model-catalog.json not found");
		process.exit(1);
	}
	const catalogRaw = readFileSync(catalogPath, "utf8");
	const catalogEol = detectEol(catalogRaw);
	const catalog = JSON.parse(catalogRaw);
	const antigravity = catalog.antigravity;
	if (!antigravity?.profiles?.[profileName]) {
		console.error(`Profile '${profileName}' not found in catalog.`);
		process.exit(1);
	}
	const profile = antigravity.profiles[profileName];
	const isPending = profile.status === "pending" || profile.pendingModels?.some((m) => m.availability === "pending");

	if (isPending) {
		if (!options.display) {
			console.error(`Cannot activate pending profile '${profileName}' without --display "<picker name>"`);
			process.exit(1);
		}
		const baseName = options.display.replace(/\s*\([^)]*\)\s*$/, "").trim();
		const tierList = options.tiers ? options.tiers.split(",").map((t) => t.trim().toLowerCase()) : ["high"];
		const baseSlug = baseName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
		const tierLabel = (tier) => tier.charAt(0).toUpperCase() + tier.slice(1);
		for (const tier of tierList) {
			const modelId = `${baseSlug}-${tier}`;
			if (!antigravity.availableModels.some((m) => m.modelId === modelId)) {
				antigravity.availableModels.push({
					modelId,
					displayName: `${baseName} (${tierLabel(tier)})`,
					provider: "google",
					speed: "moderate",
					reasoningLevel: tier,
					availabilitySource: "ui",
				});
			}
		}
		const topTier = tierList.at(-1);
		const topId = `${baseSlug}-${topTier}`;
		profile.modelName = `${baseName} (${tierLabel(topTier)})`;
		for (const role of REASONING_ROLES) {
			const chain = antigravity.roles?.[role]?.fallbackChain;
			if (chain && !chain.includes(topId)) chain.unshift(topId);
		}
		profile.status = "active";
		if (profile.pendingModels) {
			for (const pm of profile.pendingModels) pm.availability = "available";
		}
		if (options.context) {
			updatePostCompactBudget(root, baseSlug, Number(options.context));
		} else {
			console.warn("[apply-model-profile] Warning: --context not specified; post-compact-budget left untouched.");
		}
	}

	if (options.verifyLane) {
		profile.lanes = profile.lanes ?? {};
		profile.lanes.verifyLane = options.verifyLane;
	}

	antigravity.activeProfile = profileName;
	writeFileSync(catalogPath, JSON.stringify(catalog, null, "\t") + catalogEol);

	for (const fileInfo of MARKER_FILES) {
		const filePath = join(root, fileInfo.path);
		let content = readFileSync(filePath, "utf8");
		for (const markerId of fileInfo.markers) {
			const rendered = renderMarkerContent(markerId, profile, profileName);
			content = replaceMarkerBlock(content, markerId, rendered);
		}
		writeFileSync(filePath, content);
	}

	if (!options.noBuild) {
		execSync("npm run sync:skills", { cwd: root, stdio: "inherit" });
		execSync("npm run build", { cwd: root, stdio: "inherit" });
	}
	console.log(`[apply-model-profile] Successfully applied profile '${profileName}'.`);
}

const { profileName, options } = parseArgs(process.argv.slice(2));
const catalogPath = join(options.root, "model-catalog.json");
const catalog = existsSync(catalogPath) ? JSON.parse(readFileSync(catalogPath, "utf8")) : null;
const targetProfile = profileName || catalog?.antigravity?.activeProfile;

if (options.check) {
	if (!catalog) {
		console.error("model-catalog.json not found");
		process.exit(1);
	}
	runCheck(options.root, catalog, targetProfile);
} else {
	if (!targetProfile) {
		console.error("Usage: node scripts/apply-model-profile.mjs <profile> [options]");
		process.exit(1);
	}
	applyProfile(options.root, targetProfile, options);
}
