#!/usr/bin/env node
import { existsSync, lstatSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson } from "./staged-distribution/bundle.mjs";
import { validateStagedDistribution } from "./staged-distribution/validator.mjs";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const FLAGS = new Set(["--subject-root", "--artifact-root", "--receipt"]);
const MAX_ERROR_LENGTH = 240;

class CliError extends Error {
	constructor(code, message) {
		super(message);
		this.code = code;
	}
}

function parseArguments(argv) {
	const values = new Map();
	for (let index = 0; index < argv.length; index += 2) {
		const flag = argv[index];
		if (!FLAGS.has(flag)) throw new CliError("args", "unknown argument");
		if (values.has(flag)) throw new CliError("args", `duplicate ${flag}`);
		const value = argv[index + 1];
		if (value === undefined || value === "" || value.startsWith("--")) {
			throw new CliError("args", `missing value for ${flag}`);
		}
		values.set(flag, resolve(value));
	}
	return Object.freeze({
		artifactRoot: values.get("--artifact-root"),
		receipt: values.get("--receipt"),
		subjectRoot: values.get("--subject-root") ?? REPO_ROOT,
	});
}

function writeReceipt(path, line) {
	const parent = dirname(path);
	try {
		mkdirSync(parent, { recursive: true });
		if (!lstatSync(parent).isDirectory()) throw new Error("invalid receipt parent");
		if (existsSync(path) && (lstatSync(path).isSymbolicLink() || !lstatSync(path).isFile())) {
			throw new Error("invalid receipt target");
		}
		writeFileSync(path, line);
	} catch {
		throw new CliError("receipt", "could not write the report receipt");
	}
}

async function main() {
	const options = parseArguments(process.argv.slice(2));
	let temporaryRoot;
	let artifactRoot = options.artifactRoot;
	if (artifactRoot === undefined) {
		try {
			temporaryRoot = mkdtempSync(join(tmpdir(), "todo15 distribution cli "));
			artifactRoot = join(temporaryRoot, "bundle");
		} catch {
			throw new CliError("setup", "could not create the temporary artifact bundle");
		}
	}

	let reportLine;
	let failure;
	try {
		const report = await validateStagedDistribution({
			artifactRoot,
			nodePath: process.execPath,
			subjectRoot: options.subjectRoot,
		});
		reportLine = `${canonicalJson(report)}\n`;
	} catch {
		failure = new CliError("validation", "staged distribution validation failed");
	} finally {
		if (temporaryRoot !== undefined) {
			try {
				rmSync(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
			} catch {
				failure ??= new CliError("cleanup", "temporary artifact cleanup failed");
			}
		}
	}
	if (failure !== undefined) throw failure;
	if (options.receipt !== undefined) writeReceipt(options.receipt, reportLine);
	process.stdout.write(reportLine);
}

try {
	await main();
} catch (error) {
	const code = error instanceof CliError ? error.code : "internal";
	const message = error instanceof CliError ? error.message : "distribution validation failed";
	const safeMessage = message.replace(/[\r\n\x00-\x1f\x7f]+/g, " ").slice(0, MAX_ERROR_LENGTH);
	process.stderr.write(`[distribution.${code}] ${safeMessage}\n`);
	process.exitCode = 1;
}
