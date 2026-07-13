import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MINIMUM_VERSION = [3, 40, 1];
const MARKER = "LAZYANTIGRAVITY_SQLITE_SAFE_MARKER";

export function parseSqliteVersion(output) {
	const match = /^\s*(\d+)\.(\d+)\.(\d+)\b/.exec(String(output));
	return match ? match.slice(1, 4).map(Number) : null;
}

function compareVersion(left, right) {
	for (let index = 0; index < right.length; index += 1) {
		if (left[index] !== right[index]) return left[index] - right[index];
	}
	return 0;
}

function sqliteString(value) {
	return `'${String(value).replaceAll("'", "''")}'`;
}

function unavailable(reasonCode, version = null) {
	return { status: "unavailable", reasonCode, version };
}

function failureReason(error, fallback) {
	if (error?.code === "ENOENT") return "SQLITE_NOT_FOUND";
	if (typeof error?.code === "string" && error.code.startsWith("SQLITE_")) return error.code;
	return fallback;
}

function safeControlWorks(runFile, args) {
	try {
		return /(^|\D)1(\D|$)/.test(String(runFile("sqlite3", args, { input: "SELECT 1;\n" })));
	} catch {
		return false;
	}
}

function isExpectedSafeRejection(error) {
	return error?.code === "SQLITE_EXECUTION_FAILED"
		&& Number.isInteger(error?.processExitCode)
		&& error.processExitCode !== 0;
}

export function probeSqliteWithRunner(runFile) {
	let versionOutput;
	try {
		versionOutput = runFile("sqlite3", ["--version"], { input: "" });
	} catch (error) {
		return unavailable(failureReason(error, "SQLITE_EXECUTION_FAILED"));
	}
	const parsed = parseSqliteVersion(versionOutput);
	if (!parsed) return unavailable("SQLITE_VERSION_INVALID");
	const version = parsed.join(".");
	if (compareVersion(parsed, MINIMUM_VERSION) < 0) return unavailable("SQLITE_VERSION_UNSUPPORTED", version);

	const probeRoot = mkdtempSync(join(tmpdir(), "lazyantigravity-db-probe-"));
	const sourcePath = join(probeRoot, "read-source.txt");
	const canaryPath = join(probeRoot, "write-canary.txt");
	const unsafeArgs = ["-readonly", ":memory:"];
	const safeArgs = ["--safe", "-readonly", ":memory:"];
	writeFileSync(sourcePath, MARKER, { mode: 0o600 });
	try {
		if (!safeControlWorks(runFile, safeArgs)) return unavailable("SQLITE_SAFE_MODE_NONCONFORMING", version);
		try {
			const readOutput = runFile("sqlite3", unsafeArgs, {
				input: `SELECT hex(readfile(${sqliteString(sourcePath)}));\n`,
			});
			if (!String(readOutput).toUpperCase().includes(Buffer.from(MARKER).toString("hex").toUpperCase())) {
				return unavailable("SQLITE_FILEIO_CANARY_UNAVAILABLE", version);
			}
			runFile("sqlite3", unsafeArgs, {
				input: `SELECT writefile(${sqliteString(canaryPath)}, ${sqliteString(MARKER)});\n`,
			});
			if (!existsSync(canaryPath) || readFileSync(canaryPath, "utf8") !== MARKER) {
				return unavailable("SQLITE_FILEIO_CANARY_UNAVAILABLE", version);
			}
			rmSync(canaryPath, { force: true });
		} catch (error) {
			return unavailable(failureReason(error, "SQLITE_FILEIO_CANARY_UNAVAILABLE"), version);
		}

		for (const query of [
			`SELECT readfile(${sqliteString(sourcePath)});\n`,
			`SELECT writefile(${sqliteString(canaryPath)}, 'unsafe');\n`,
		]) {
			try {
				runFile("sqlite3", safeArgs, { input: query });
				return unavailable("SQLITE_SAFE_MODE_NONCONFORMING", version);
			} catch (error) {
				if (!isExpectedSafeRejection(error)) {
					return unavailable(failureReason(error, "SQLITE_SAFE_MODE_PROBE_FAILED"), version);
				}
			}
			if (existsSync(canaryPath) || !safeControlWorks(runFile, safeArgs)) {
				return unavailable("SQLITE_SAFE_MODE_NONCONFORMING", version);
			}
		}
		return { status: "passed", reasonCode: null, version };
	} finally {
		rmSync(probeRoot, { recursive: true, force: true });
	}
}
