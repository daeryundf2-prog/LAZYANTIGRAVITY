import { execFileSync } from "node:child_process";
import {
	closeSync,
	existsSync,
	lstatSync,
	openSync,
	readSync,
	realpathSync,
} from "node:fs";
import { resolve } from "node:path";

import { isSensitiveKey, redactText, redactValue } from "./redaction.mjs";
import { parseSqliteVersion, probeSqliteWithRunner } from "./sqlite-safe-probe.mjs";

export { parseSqliteVersion } from "./sqlite-safe-probe.mjs";

export const PROCESS_LIMITS = Object.freeze({ timeout: 5000, maxBuffer: 1024 * 1024 });
const QUERY_LIMIT = 64 * 1024;
const FORMAT_FLAGS = Object.freeze({ json: "-json" });
const DENIED_TOKENS = new Set([
	"ALTER", "ANALYZE", "ATTACH", "BEGIN", "COMMIT", "CREATE", "DELETE", "DETACH", "DROP", "END",
	"INSERT", "PRAGMA", "REINDEX", "RELEASE", "REPLACE", "ROLLBACK", "SAVEPOINT", "TRIGGER", "UPDATE",
	"VACUUM", "WITH", "EDIT", "FSDIR", "FTS3_TOKENIZER", "LOAD_EXTENSION", "READFILE", "WRITEFILE", "ZIPFILE",
]);

export class DatabaseBoundaryError extends Error {
	constructor(code, status = "failed", details = {}) {
		super(code);
		this.name = "DatabaseBoundaryError";
		this.code = code;
		this.status = status;
		this.processExitCode = Number.isInteger(details.processExitCode) ? details.processExitCode : null;
	}
}

export function classifyProcessError(error) {
	if (error?.code === "ENOENT") return "SQLITE_NOT_FOUND";
	if (error?.code === "ENOBUFS" || /maxBuffer/i.test(String(error?.message ?? ""))) return "SQLITE_OUTPUT_LIMIT";
	if (error?.code === "ETIMEDOUT" || error?.killed === true || error?.signal === "SIGTERM") return "SQLITE_TIMEOUT";
	return "SQLITE_EXECUTION_FAILED";
}

export function runBounded(command, args, { input = "" } = {}) {
	try {
		return execFileSync(command, args, {
			encoding: "utf8",
			input,
			maxBuffer: PROCESS_LIMITS.maxBuffer,
			stdio: ["pipe", "pipe", "pipe"],
			timeout: PROCESS_LIMITS.timeout,
			windowsHide: true,
		});
	} catch (error) {
		throw new DatabaseBoundaryError(
			classifyProcessError(error),
			error?.code === "ENOENT" ? "unavailable" : "failed",
			{ processExitCode: error?.status },
		);
	}
}

export function probeSqlite({ runFile = runBounded } = {}) {
	return probeSqliteWithRunner(runFile);
}

function rejectQuery() {
	throw new DatabaseBoundaryError("QUERY_REJECTED");
}

export function validateReadOnlyQuery(value) {
	if (typeof value !== "string" || Buffer.byteLength(value) === 0 || Buffer.byteLength(value) > QUERY_LIMIT) rejectQuery();
	if (value.includes("\0") || value.includes("\uFEFF")) rejectQuery();
	for (const character of value) {
		const code = character.charCodeAt(0);
		if (code < 32 && character !== "\t" && character !== "\r" && character !== "\n") rejectQuery();
	}

	const source = value.trim();
	if (!source) rejectQuery();
	const tokens = [];
	let inString = false;
	let atLineStart = true;
	let statement = source;
	for (let index = 0; index < source.length; index += 1) {
		const character = source[index];
		if (inString) {
			if (character === "'" && source[index + 1] === "'") {
				index += 1;
			} else if (character === "'") {
				inString = false;
				atLineStart = false;
			}
			continue;
		}
		if (character === "\n" || character === "\r") {
			atLineStart = true;
			continue;
		}
		if (/\s/.test(character)) continue;
		if (character === "'") {
			inString = true;
			atLineStart = false;
			continue;
		}
		if (character === '"' || character === "`" || character === "[") rejectQuery();
		if (source.startsWith("--", index) || source.startsWith("/*", index) || source.startsWith("*/", index)) rejectQuery();
		if (atLineStart && (character === "." || character === "#")) rejectQuery();
		if (atLineStart && character === "/" && source.slice(index).split(/\r?\n/, 1)[0].trim() === "/") rejectQuery();
		if (character === ";") {
			if (source.slice(index + 1).trim() !== "") rejectQuery();
			statement = source.slice(0, index).trimEnd();
			break;
		}
		if (/[A-Za-z_]/.test(character)) {
			let end = index + 1;
			while (end < source.length && /[A-Za-z0-9_]/.test(source[end])) end += 1;
			const token = source.slice(index, end).toUpperCase();
			if (atLineStart && token === "GO" && source.slice(end).split(/\r?\n/, 1)[0].trim() === "") rejectQuery();
			tokens.push(token);
			if (DENIED_TOKENS.has(token) || token.startsWith("PRAGMA_") || isSensitiveKey(token)) rejectQuery();
			atLineStart = false;
			index = end - 1;
			continue;
		}
		atLineStart = false;
	}
	if (inString || tokens[0] !== "SELECT" || !statement) rejectQuery();
	return statement;
}

export function isLocalDatabasePathSyntax(value) {
	return typeof value === "string"
		&& Boolean(value.trim())
		&& !value.includes("\0")
		&& !value.startsWith("\\")
		&& !value.startsWith("//")
		&& !/^[a-z][a-z0-9+.-]*:\/\//i.test(value);
}

function hasSqliteSidecar(path) {
	return ["-wal", "-shm", "-journal"].some((suffix) => existsSync(`${path}${suffix}`));
}

export function inspectDatabasePath(value) {
	if (!isLocalDatabasePathSyntax(value)) throw new DatabaseBoundaryError("DATABASE_PATH_REJECTED");
	let candidate;
	try {
		candidate = resolve(value);
		const initial = lstatSync(candidate);
		if (!initial.isFile() || initial.isSymbolicLink()) throw new Error("not regular");
		candidate = realpathSync(candidate);
		if (!isLocalDatabasePathSyntax(candidate) || !lstatSync(candidate).isFile() || hasSqliteSidecar(candidate)) {
			throw new Error("unsafe database path");
		}
		const header = Buffer.alloc(20);
		const descriptor = openSync(candidate, "r");
		try {
			if (readSync(descriptor, header, 0, header.length, 0) !== header.length) throw new Error("short header");
		} finally {
			closeSync(descriptor);
		}
		if (!header.subarray(0, 16).equals(Buffer.from("SQLite format 3\0"))) throw new Error("not sqlite");
		if (header[18] === 2 || header[19] === 2) throw new Error("wal database");
	} catch {
		throw new DatabaseBoundaryError("DATABASE_PATH_REJECTED");
	}
	return candidate;
}

function sanitizeQueryOutput(output) {
	const source = String(output).trim();
	if (!source) return "[]";
	try {
		return redactText(JSON.stringify(redactValue(JSON.parse(source))), PROCESS_LIMITS.maxBuffer);
	} catch {
		throw new DatabaseBoundaryError("SQLITE_OUTPUT_INVALID");
	}
}

export function executeReadOnlyQuery({ databasePath, query, format = "json" }, dependencies = {}) {
	if (!(format in FORMAT_FLAGS)) throw new DatabaseBoundaryError("QUERY_REJECTED");
	const statement = validateReadOnlyQuery(query);
	const resolvedDatabase = inspectDatabasePath(databasePath);
	const runFile = dependencies.runFile ?? runBounded;
	const probe = dependencies.probe ?? ((options) => probeSqlite(options));
	const probeResult = probe({ runFile });
	if (probeResult.status !== "passed") {
		throw new DatabaseBoundaryError(probeResult.reasonCode ?? "SQLITE_UNAVAILABLE", "unavailable");
	}
	try {
		const output = runFile("sqlite3", ["--safe", "-readonly", "-nofollow", FORMAT_FLAGS[format], resolvedDatabase], {
			input: `${statement};\n`,
			...PROCESS_LIMITS,
		});
		if (hasSqliteSidecar(resolvedDatabase)) throw new DatabaseBoundaryError("DATABASE_STATE_CHANGED");
		return { status: "passed", text: sanitizeQueryOutput(output), version: probeResult.version };
	} catch (error) {
		if (error instanceof DatabaseBoundaryError) throw error;
		throw new DatabaseBoundaryError(classifyProcessError(error));
	}
}
