import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const serverPath = join(root, "scripts", "database-mcp.mjs");
const sqliteModulePath = join(root, "scripts", "database-mcp", "sqlite-readonly.mjs");
const redactionModulePath = join(root, "scripts", "database-mcp", "redaction.mjs");

function runMcpRaw(messages, extraEnv = {}) {
	return spawnSync(process.execPath, [serverPath], {
		cwd: root,
		encoding: "utf8",
		env: { ...process.env, ...extraEnv },
		input: `${messages.map((message) => JSON.stringify(message)).join("\n")}\n`,
		maxBuffer: 3 * 1024 * 1024,
		timeout: 10_000,
		windowsHide: true,
	});
}

function runMcp(messages, extraEnv = {}) {
	const result = runMcpRaw(messages, extraEnv);
	assert.equal(result.status, 0, result.stderr);
	return result.stdout.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

function sha256(path) {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function toolText(response) {
	return response.result?.content?.[0]?.text ?? "";
}

async function loadSqliteModule() {
	return import(new URL("../scripts/database-mcp/sqlite-readonly.mjs", import.meta.url));
}

async function loadRedactionModule() {
	return import(new URL("../scripts/database-mcp/redaction.mjs", import.meta.url));
}

function safeProbeRunner(failureFactory) {
	return (command, args, options) => {
		const input = options.input ?? "";
		if (args.includes("--version")) return "3.40.1 2022-12-28\n";
		if (/SELECT 1/i.test(input)) return "1\n";
		if (!args.includes("--safe") && /readfile/i.test(input)) {
			return Buffer.from("LAZYANTIGRAVITY_SQLITE_SAFE_MARKER").toString("hex").toUpperCase();
		}
		if (!args.includes("--safe") && /writefile/i.test(input)) {
			const match = /writefile\('((?:''|[^'])*)'/.exec(input);
			assert.ok(match, input);
			writeFileSync(match[1].replaceAll("''", "'"), "LAZYANTIGRAVITY_SQLITE_SAFE_MARKER");
			return "35\n";
		}
		if (args.includes("--safe") && /readfile|writefile/i.test(input)) throw failureFactory();
		throw new Error(`unexpected probe: ${JSON.stringify({ command, args, input })}`);
	};
}

test("characterization: database MCP accepts newline JSON-RPC initialize and tools/list", () => {
	const responses = runMcp([
		{ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "database-security-test", version: "0.0.0" } } },
		{ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
	]);

	assert.equal(responses[0].jsonrpc, "2.0");
	assert.equal(responses[0].id, 1);
	assert.equal(responses[1].id, 2);
	assert.ok(responses[1].result.tools.some((tool) => tool.name === "db_query"));
});

test("[database.tools.readonly-surface] writable and non-SQLite tools are not advertised", () => {
	const [, listed] = runMcp([
		{ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "database-security-test", version: "0.0.0" } } },
		{ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
	]);
	const names = listed.result.tools.map((tool) => tool.name).sort();
	const serialized = JSON.stringify(listed.result.tools);

	assert.deepEqual(names, ["db_list_connections", "db_query"], "database.tools.readonly-surface");
	assert.doesNotMatch(serialized, /db_add_connection|db_discover_containers|postgres|mysql|mssql/i);
	assert.doesNotMatch(serialized, /password|username|connectionUrl|\"url\"/i, "database.schema.no-credential-fields");
	assert.deepEqual(listed.result.tools.find((tool) => tool.name === "db_query").inputSchema.properties.format.enum, ["json"]);
});

test("[database.config.corrupt-preserved] a corrupt connection file is never overwritten", () => {
	const tempRoot = mkdtempSync(join(tmpdir(), "lazyantigravity-db-red-"));
	const configDir = join(tempRoot, "config");
	const configPath = join(configDir, "connections.json");
	mkdirSync(configDir, { recursive: true });
	writeFileSync(configPath, "{CORRUPT_PASSWORD_SENTINEL", { mode: 0o600 });
	const before = sha256(configPath);

	try {
		runMcp([
			{
				jsonrpc: "2.0",
				id: 1,
				method: "tools/call",
				params: {
					name: "db_add_connection",
					arguments: { name: "unsafe", dbType: "sqlite", filePath: "unsafe.db", password: "LEAK_ME" },
				},
			},
		], { SQLIT_CONFIG_DIR: configDir });
		assert.equal(sha256(configPath), before, "database.config.corrupt-preserved");
		assert.equal(readFileSync(configPath, "utf8"), "{CORRUPT_PASSWORD_SENTINEL");
	} finally {
		rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("[database.sqlite.argv-and-stdin] production source requires safe readonly bounded stdin execution", () => {
	const source = `${readFileSync(serverPath, "utf8")}\n${readFileSync(sqliteModulePath, "utf8")}`;
	assert.match(source, /--safe/, "database.sqlite.safe-canary");
	assert.match(source, /-readonly/, "database.sqlite.argv-and-stdin");
	assert.match(source, /5_?000/, "database.sqlite.timeout-5s");
	assert.match(source, /1024\s*\*\s*1024|1048576/, "database.sqlite.stream-cap-1mib");
	assert.doesNotMatch(source, /(?:execFileSync|runFile)\(\s*["']sqlit["']|pipx install sqlit-tui/, "database.query.sqlite-only");
	assert.doesNotMatch(source, /--nonce|--unsafe-testing/);
});

test("[database.query.no-mutations] hostile SQL is rejected before backend discovery", () => {
	const [response] = runMcp([
		{
			jsonrpc: "2.0",
			id: 1,
			method: "tools/call",
			params: {
				name: "db_query",
				arguments: { databasePath: "fixture.db", query: "CREATE TABLE stolen(value TEXT)" },
			},
		},
	]);
	const text = response.result?.content?.[0]?.text ?? "";
	assert.equal(response.result?.isError, true);
	assert.match(text, /QUERY_REJECTED/, "database.query.no-mutations");
	assert.doesNotMatch(text, /CREATE TABLE stolen|fixture\.db/);
});

test("[database.contract.sqlite-cli-hash] vendored CLI contract matches the pinned artifact", () => {
	const contractPath = join(root, "contracts", "antigravity", "sqlite-cli.html");
	assert.equal(sha256(contractPath), "8639b3a639eb44f9ad7a1f498511867dc54faf893338ff988a03c02c17d8b82f");
	const contract = readFileSync(contractPath, "utf8");
	assert.match(contract, /The --safe command-line option/);
	assert.match(contract, /-readonly\s+open the database read-only/);
	assert.match(contract, /-nonce STRING\s+set the safe-mode escape nonce/);
});

test("[database.contract.sqlite-release-hash] vendored 3.40.1 contract pins the safe-mode fix", () => {
	const contractPath = join(root, "contracts", "antigravity", "sqlite-release-3.40.1.html");
	assert.equal(sha256(contractPath), "25cd2bf0052e912e5330ec3836134b6144547a6d251d80ab7fd4a32e6a945559");
	const contract = readFileSync(contractPath, "utf8");
	assert.match(contract, /version 3\.40\.1/);
	assert.match(contract, /writefile\(\).*harmful side-effects/s);
});

test("[database.config.recursive-redaction] discovery returns only redacted SQLite metadata", () => {
	const tempRoot = mkdtempSync(join(tmpdir(), "lazyantigravity-db-config-"));
	const configDir = join(tempRoot, "config");
	mkdirSync(configDir, { recursive: true });
	writeFileSync(join(configDir, "connections.json"), JSON.stringify({
		local: {
			db_type: "sqlite",
			file_path: "fixture.db",
			password: "PASSWORD_SENTINEL",
			privateKey: "PRIVATE_KEY_SENTINEL",
			nested: [{
				token: "TOKEN_SENTINEL",
				url: "postgres://user:URL_SENTINEL@example.invalid/db?api_key=QUERY_API_SENTINEL&token=QUERY_TOKEN_SENTINEL",
			}],
		},
		remote: { db_type: "postgresql", url: "postgres://user:REMOTE_SENTINEL@example.invalid/db" },
	}), { mode: 0o600 });

	try {
		const [response] = runMcp([{
			jsonrpc: "2.0",
			id: 1,
			method: "tools/call",
			params: { name: "db_list_connections", arguments: {} },
		}], { SQLIT_CONFIG_DIR: configDir });
		const text = toolText(response);
		assert.equal(response.result.isError, false);
		assert.match(text, /local/);
		assert.doesNotMatch(text, /PASSWORD_SENTINEL|PRIVATE_KEY_SENTINEL|TOKEN_SENTINEL|URL_SENTINEL|QUERY_API_SENTINEL|QUERY_TOKEN_SENTINEL|REMOTE_SENTINEL|postgresql/);
	} finally {
		rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("[database.config.no-secret-persistence] removed mutation tool cannot create a config file", () => {
	const tempRoot = mkdtempSync(join(tmpdir(), "lazyantigravity-db-no-write-"));
	const configDir = join(tempRoot, "config");
	try {
		const [response] = runMcp([{
			jsonrpc: "2.0",
			id: 1,
			method: "tools/call",
			params: {
				name: "db_add_connection",
				arguments: { name: "unsafe", dbType: "sqlite", filePath: "unsafe.db", password: "LEAK_ME" },
			},
		}], { SQLIT_CONFIG_DIR: configDir });
		assert.equal(response.error?.code, -32601);
		assert.equal(existsSync(join(configDir, "connections.json")), false);
		assert.doesNotMatch(JSON.stringify(response), /LEAK_ME/);
	} finally {
		rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("[database.config.corrupt-preserved] corrupt discovery is bounded, sanitized, and byte-preserving", () => {
	const tempRoot = mkdtempSync(join(tmpdir(), "lazyantigravity-db-corrupt-"));
	const configDir = join(tempRoot, "config");
	const configPath = join(configDir, "connections.json");
	mkdirSync(configDir, { recursive: true });
	writeFileSync(configPath, "{CORRUPT_SECRET_SENTINEL", { mode: 0o600 });
	const before = sha256(configPath);

	try {
		const [response] = runMcp([{
			jsonrpc: "2.0",
			id: 1,
			method: "tools/call",
			params: { name: "db_list_connections", arguments: {} },
		}], { SQLIT_CONFIG_DIR: configDir });
		const text = toolText(response);
		assert.equal(response.result.isError, true);
		assert.match(text, /CONFIG_CORRUPT/);
		assert.doesNotMatch(text, /CORRUPT_SECRET_SENTINEL|connections\.json|Unexpected token/);
		assert.ok(Buffer.byteLength(text) <= 2048);
		assert.equal(sha256(configPath), before);
	} finally {
		rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("[database.config.recursive-redaction] recursive sanitizer removes keyed secrets and URL user-info", async () => {
	const { redactValue, redactText } = await loadRedactionModule();
	const sanitized = redactValue({
		password: "PASSWORD_SENTINEL",
		nested: [{ apiKey: "API_KEY_SENTINEL" }, { value: "postgres://user:URL_SENTINEL@example.invalid/db" }],
	});
	const serialized = JSON.stringify(sanitized);
	assert.doesNotMatch(serialized, /PASSWORD_SENTINEL|API_KEY_SENTINEL|URL_SENTINEL/);
	assert.match(serialized, /\[REDACTED\]/);
	assert.ok(Buffer.byteLength(redactText("x".repeat(4096), 2048)) <= 2048);
});

test("[database.query.single-statement] the validator accepts a single SELECT without string false positives", async () => {
	const { validateReadOnlyQuery } = await loadSqliteModule();
	for (const query of [
		"SELECT 1",
		"SELECT '; -- writefile(password)' AS harmless",
		"SELECT 'it''s safe' AS value;",
		"SELECT 4 / 2 AS quotient",
	]) {
		assert.match(validateReadOnlyQuery(query), /^SELECT/i);
	}
});

test("[database.query.no-mutations] SQL mutation and transaction forms are rejected", async () => {
	const { validateReadOnlyQuery } = await loadSqliteModule();
	const attacks = [
		"CREATE TABLE x(v)", "INSERT INTO x VALUES (1)", "UPDATE x SET v=2", "DELETE FROM x",
		"REPLACE INTO x VALUES (1)", "DROP TABLE x", "ALTER TABLE x ADD COLUMN y", "ATTACH 'x' AS y",
		"DETACH y", "VACUUM INTO 'copy.db'", "PRAGMA journal_mode=WAL", "BEGIN", "COMMIT", "ROLLBACK",
		"SELECT 1 FROM x WHERE EXISTS (SELECT 1); DELETE FROM x",
	];
	for (const query of attacks) assert.throws(() => validateReadOnlyQuery(query), /QUERY_REJECTED/, query);
});

test("[database.query.no-comments-or-cte] comments, CTEs, quoted identifiers, and CLI separators are rejected", async () => {
	const { validateReadOnlyQuery } = await loadSqliteModule();
	const attacks = [
		"WITH x AS (SELECT 1) SELECT * FROM x",
		"SELECT * FROM (WITH x AS (SELECT 1) SELECT * FROM x)",
		"SELECT 1 -- comment", "SELECT 1 /* comment */", "SELECT load_/**/extension('x')",
		"SELECT \"writefile\"('x','y')", "SELECT `readfile`('x')", "SELECT [edit]('x')",
		"SELECT 1\nGO\nSELECT 2", "SELECT 1\n/\nSELECT 2", "# CLI comment\nSELECT 1",
	];
	for (const query of attacks) assert.throws(() => validateReadOnlyQuery(query), /QUERY_REJECTED/, query);
});

test("[database.query.no-dot-commands] every line-start dot command is rejected", async () => {
	const { validateReadOnlyQuery } = await loadSqliteModule();
	for (const command of [".shell", ".system", ".read |", ".open", ".load", ".backup", ".save", ".once", ".output", ".nonce", ".import", ".restore"]) {
		assert.throws(() => validateReadOnlyQuery(`${command} target`), /QUERY_REJECTED/, command);
		assert.throws(() => validateReadOnlyQuery(`SELECT 1\n  ${command} target`), /QUERY_REJECTED/, command);
	}
});

test("[database.query.no-host-functions] host-side-effect functions and table-valued PRAGMAs are rejected case-insensitively", async () => {
	const { validateReadOnlyQuery } = await loadSqliteModule();
	for (const name of ["readfile", "writefile", "edit", "load_extension", "fts3_tokenizer", "fsdir", "zipfile"]) {
		assert.throws(() => validateReadOnlyQuery(`SeLeCt ${name.toUpperCase()}('x')`), /QUERY_REJECTED/, name);
	}
	for (const query of ["SELECT * FROM pragma_optimize", "SELECT * FROM PRAGMA_WAL_CHECKPOINT", "SELECT * FROM main.pragma_journal_mode"]) {
		assert.throws(() => validateReadOnlyQuery(query), /QUERY_REJECTED/, query);
	}
});

test("[database.query.sqlite-only] invalid types, NUL, controls, oversized input, and non-SQLite paths fail closed", async () => {
	const { inspectDatabasePath, isLocalDatabasePathSyntax, validateReadOnlyQuery } = await loadSqliteModule();
	for (const query of [null, 7, "", "SELECT\u0000 1", "SELECT\u0007 1", `SELECT '${"x".repeat(65_536)}'`]) {
		assert.throws(() => validateReadOnlyQuery(query), /QUERY_REJECTED/);
	}
	assert.throws(() => inspectDatabasePath("postgres://user:pass@example.invalid/db"), /DATABASE_PATH_REJECTED/);
	for (const path of ["\\\\server\\share\\fixture.db", "\\\\?\\UNC\\server\\share\\fixture.db", "\\\\.\\pipe\\sqlite-probe", "//server/share/fixture.db"]) {
		assert.equal(isLocalDatabasePathSyntax(path), false, path);
	}
});

test("[database.sqlite.minimum-version] versions are parsed numerically and 3.40.0 is unavailable", async () => {
	const { parseSqliteVersion, probeSqlite } = await loadSqliteModule();
	assert.deepEqual(parseSqliteVersion("3.40.1 2022-12-28"), [3, 40, 1]);
	assert.deepEqual(parseSqliteVersion("3.100.0 custom"), [3, 100, 0]);
	assert.equal(parseSqliteVersion("not sqlite"), null);
	const old = probeSqlite({ runFile: () => "3.40.0 2022-11-16\n" });
	assert.deepEqual(old, { status: "unavailable", reasonCode: "SQLITE_VERSION_UNSUPPORTED", version: "3.40.0" });
	const malformed = probeSqlite({ runFile: () => "not-a-version\n" });
	assert.deepEqual(malformed, { status: "unavailable", reasonCode: "SQLITE_VERSION_INVALID", version: null });
	const missing = probeSqlite({ runFile: () => { throw Object.assign(new Error("missing"), { code: "ENOENT" }); } });
	assert.deepEqual(missing, { status: "unavailable", reasonCode: "SQLITE_NOT_FOUND", version: null });
});

test("[database.sqlite.safe-canary] a conforming runner must block readfile and writefile canaries", async () => {
	const { probeSqlite } = await loadSqliteModule();
	const calls = [];
	const conformingDelegate = safeProbeRunner(() => Object.assign(new Error("blocked by safe mode"), {
		code: "SQLITE_EXECUTION_FAILED",
		processExitCode: 1,
	}));
	const conforming = (command, args, options) => {
		calls.push({ command, args, input: options.input ?? "" });
		return conformingDelegate(command, args, options);
	};
	const result = probeSqlite({ runFile: conforming });
	assert.deepEqual(result, { status: "passed", reasonCode: null, version: "3.40.1" });
	assert.ok(calls.every((call) => call.command === "sqlite3"));
	assert.ok(calls.filter((call) => !call.args.includes("--version")).every((call) => call.args.includes("-readonly")));
	assert.doesNotMatch(JSON.stringify(calls.map((call) => call.args)), /--nonce|--unsafe-testing/);

	const genericFailure = probeSqlite({ runFile: safeProbeRunner(() => Object.assign(new Error("access denied"), { code: "EACCES" })) });
	assert.equal(genericFailure.status, "unavailable");
	assert.equal(genericFailure.reasonCode, "SQLITE_SAFE_MODE_PROBE_FAILED");
	const timedOut = probeSqlite({ runFile: safeProbeRunner(() => Object.assign(new Error("timeout"), { code: "SQLITE_TIMEOUT" })) });
	assert.equal(timedOut.status, "unavailable");
	assert.equal(timedOut.reasonCode, "SQLITE_TIMEOUT");

	const nonconforming = probeSqlite({ runFile: (command, args) => args.includes("--version") ? "3.40.1\n" : "unsafe success\n" });
	assert.equal(nonconforming.status, "unavailable");
	assert.match(nonconforming.reasonCode, /SQLITE_(?:FILEIO_CANARY_UNAVAILABLE|SAFE_MODE_NONCONFORMING)/);
});

test("[database.sqlite.argv-and-stdin] query uses literal sqlite3, fixed argv, and one bounded stdin statement", async () => {
	const { executeReadOnlyQuery } = await loadSqliteModule();
	const tempRoot = mkdtempSync(join(tmpdir(), "lazyantigravity-db-runner-"));
	const databasePath = join(tempRoot, "fixture.db");
	writeFileSync(databasePath, Buffer.concat([Buffer.from("SQLite format 3\0"), Buffer.alloc(128)]), { mode: 0o600 });
	const databaseBefore = sha256(databasePath);
	const calls = [];
	try {
		const result = executeReadOnlyQuery({ databasePath, query: "SELECT 1", format: "json" }, {
			probe: () => ({ status: "passed", reasonCode: null, version: "3.40.1" }),
			runFile: (command, args, options) => {
				calls.push({ command, args, options });
				return "[{\"value\":1}]\n";
			},
		});
		assert.equal(result.status, "passed");
		assert.equal(calls.length, 1);
		assert.equal(calls[0].command, "sqlite3");
		assert.deepEqual(calls[0].args.slice(0, 4), ["--safe", "-readonly", "-nofollow", "-json"]);
		assert.equal(calls[0].args.at(-1), databasePath);
		assert.equal(calls[0].options.input, "SELECT 1;\n");
		assert.ok(calls[0].options.timeout === 5000 && calls[0].options.maxBuffer === 1024 * 1024);
		assert.doesNotMatch(JSON.stringify(calls[0].args), /SELECT 1|--nonce|--unsafe-testing/);
		assert.equal(sha256(databasePath), databaseBefore, "database.database-state.unchanged");
	} finally {
		rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("[database.query.output-redaction] JSON query results redact credential keys and URL query secrets", async () => {
	const { executeReadOnlyQuery } = await loadSqliteModule();
	const tempRoot = mkdtempSync(join(tmpdir(), "lazyantigravity-db-output-"));
	const databasePath = join(tempRoot, "fixture.db");
	writeFileSync(databasePath, Buffer.concat([Buffer.from("SQLite format 3\0"), Buffer.alloc(128)]), { mode: 0o600 });
	try {
		const result = executeReadOnlyQuery({ databasePath, query: "SELECT * FROM metadata", format: "json" }, {
			probe: () => ({ status: "passed", reasonCode: null, version: "3.40.1" }),
			runFile: () => JSON.stringify([{
				password: "QUERY_PASSWORD_SENTINEL",
				privateKey: "QUERY_PRIVATE_KEY_SENTINEL",
				url: "sqlite:///fixture.db?token=QUERY_TOKEN_SENTINEL&api_key=QUERY_API_SENTINEL",
			}]),
		});
		assert.doesNotMatch(result.text, /QUERY_(?:PASSWORD|PRIVATE_KEY|TOKEN|API)_SENTINEL/);
		assert.match(result.text, /\[REDACTED\]/);
		assert.throws(() => executeReadOnlyQuery({ databasePath, query: "SELECT 1", format: "csv" }, {
			probe: () => ({ status: "passed", reasonCode: null, version: "3.40.1" }),
			runFile: () => "password\nQUERY_PASSWORD_SENTINEL\n",
		}), /QUERY_REJECTED/);
	} finally {
		rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("[database.host-state.sidecars] WAL databases and SQLite sidecars fail closed", async () => {
	const { executeReadOnlyQuery, inspectDatabasePath } = await loadSqliteModule();
	const tempRoot = mkdtempSync(join(tmpdir(), "lazyantigravity-db-sidecar-"));
	const databasePath = join(tempRoot, "fixture.db");
	const bytes = Buffer.concat([Buffer.from("SQLite format 3\0"), Buffer.alloc(128)]);
	try {
		bytes[18] = 2;
		bytes[19] = 2;
		writeFileSync(databasePath, bytes, { mode: 0o600 });
		assert.throws(() => inspectDatabasePath(databasePath), /DATABASE_PATH_REJECTED/, "WAL header");

		bytes[18] = 1;
		bytes[19] = 1;
		writeFileSync(databasePath, bytes, { mode: 0o600 });
		writeFileSync(`${databasePath}-wal`, "pre-existing sidecar");
		assert.throws(() => inspectDatabasePath(databasePath), /DATABASE_PATH_REJECTED/, "existing sidecar");
		rmSync(`${databasePath}-wal`);

		assert.throws(() => executeReadOnlyQuery({ databasePath, query: "SELECT 1" }, {
			probe: () => ({ status: "passed", reasonCode: null, version: "3.40.1" }),
			runFile: () => {
				writeFileSync(`${databasePath}-wal`, "unexpected sidecar");
				return "[{\"value\":1}]\n";
			},
		}), /DATABASE_STATE_CHANGED/);
	} finally {
		rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("[database.sqlite.stream-cap-1mib] bounded runner permits 1 MiB and rejects 1 MiB plus one", async () => {
	const { runBounded } = await loadSqliteModule();
	const exact = runBounded(process.execPath, ["-e", "process.stdout.write(Buffer.alloc(1024*1024, 120))"]);
	assert.equal(Buffer.byteLength(exact), 1024 * 1024);
	assert.throws(
		() => runBounded(process.execPath, ["-e", "process.stdout.write(Buffer.alloc(1024*1024+1, 120))"]),
		/SQLITE_OUTPUT_LIMIT/,
	);
	assert.throws(
		() => runBounded(process.execPath, ["-e", "process.stderr.write(Buffer.alloc(1024*1024+1, 120))"]),
		/SQLITE_OUTPUT_LIMIT/,
	);
});

test("[database.sqlite.timeout-5s] production limits are exact and timeout errors are typed", async () => {
	const { PROCESS_LIMITS, classifyProcessError, runBounded } = await loadSqliteModule();
	assert.deepEqual(PROCESS_LIMITS, { timeout: 5000, maxBuffer: 1024 * 1024 });
	assert.equal(classifyProcessError({ code: "ETIMEDOUT", killed: true }), "SQLITE_TIMEOUT");
	assert.equal(classifyProcessError({ code: "ENOBUFS" }), "SQLITE_OUTPUT_LIMIT");
	assert.equal(classifyProcessError({ code: "ENOENT" }), "SQLITE_NOT_FOUND");
	const startedAt = Date.now();
	assert.throws(() => runBounded(process.execPath, ["-e", "setInterval(() => {}, 1000)"]), /SQLITE_TIMEOUT/);
	const elapsed = Date.now() - startedAt;
	assert.ok(elapsed >= 4500 && elapsed < 8000, `bounded timeout elapsed=${elapsed}`);
});

test("[database.errors.sanitized-bounded] child errors expose only typed bounded diagnostics", async () => {
	const { executeReadOnlyQuery } = await loadSqliteModule();
	const tempRoot = mkdtempSync(join(tmpdir(), "lazyantigravity-db-error-"));
	const databasePath = join(tempRoot, "fixture.db");
	writeFileSync(databasePath, Buffer.concat([Buffer.from("SQLite format 3\0"), Buffer.alloc(128)]), { mode: 0o600 });
	try {
		assert.throws(() => executeReadOnlyQuery({ databasePath, query: "SELECT 1" }, {
			probe: () => ({ status: "passed", reasonCode: null, version: "3.40.1" }),
			runFile: () => { throw Object.assign(new Error("postgres://user:SECRET_SENTINEL@example.invalid/db"), { code: "ENOBUFS" }); },
		}), (error) => {
			assert.equal(error.code, "SQLITE_OUTPUT_LIMIT");
			assert.doesNotMatch(error.message, /SECRET_SENTINEL|postgres|example\.invalid/);
			assert.ok(Buffer.byteLength(error.message) <= 2048);
			return true;
		});
	} finally {
		rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("[database.errors.sanitized-bounded] MCP responses cap expansion and never reflect invalid object IDs", () => {
	const tempRoot = mkdtempSync(join(tmpdir(), "lazyantigravity-db-response-cap-"));
	const configDir = join(tempRoot, "config");
	mkdirSync(configDir, { recursive: true });
	const fields = {};
	for (let index = 0; index < 36_000; index += 1) fields[`password${index}`] = "x";
	const config = JSON.stringify({ local: { db_type: "sqlite", fields } });
	assert.ok(Buffer.byteLength(config) < 1024 * 1024);
	writeFileSync(join(configDir, "connections.json"), config, { mode: 0o600 });
	try {
		const expanded = runMcpRaw([{
			jsonrpc: "2.0",
			id: 71,
			method: "tools/call",
			params: { name: "db_list_connections", arguments: {} },
		}], { SQLIT_CONFIG_DIR: configDir });
		assert.equal(expanded.status, 0, expanded.stderr);
		assert.ok(Buffer.byteLength(expanded.stdout) <= 1024 * 1024);
		const expandedResponse = JSON.parse(expanded.stdout.trim());
		assert.equal(expandedResponse.error?.code, -32603);

		const reflected = runMcpRaw([{
			jsonrpc: "2.0",
			id: { secret: "OBJECT_ID_SECRET_SENTINEL", padding: "x".repeat(900_000) },
			method: "tools/list",
			params: {},
		}]);
		assert.equal(reflected.status, 0, reflected.stderr);
		assert.ok(Buffer.byteLength(reflected.stdout) <= 2048);
		assert.doesNotMatch(reflected.stdout + reflected.stderr, /OBJECT_ID_SECRET_SENTINEL/);
		const reflectedResponse = JSON.parse(reflected.stdout.trim());
		assert.equal(reflectedResponse.id, null);
		assert.equal(reflectedResponse.error?.code, -32600);
	} finally {
		rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("[database.real-sqlite.status] real host capability is passed only after the genuine safe probe", async (t) => {
	const { executeReadOnlyQuery, probeSqlite, runBounded, validateReadOnlyQuery } = await loadSqliteModule();
	const result = probeSqlite();
	if (result.status !== "passed") {
		if (process.env.LAZYANTIGRAVITY_REQUIRE_REAL_SQLITE === "1") {
			assert.fail(`database.real-sqlite.status: ${result.reasonCode}`);
		}
		t.skip(`unavailable/zero-score: ${result.reasonCode}`);
		return;
	}
	assert.equal(result.version.localeCompare("3.40.1", undefined, { numeric: true }) >= 0, true);
	const tempRoot = mkdtempSync(join(tmpdir(), "lazyantigravity-db-real-"));
	const databasePath = join(tempRoot, "fixture.db");
	const canaryPath = join(tempRoot, "host-canary.txt");
	try {
		runBounded("sqlite3", [databasePath], { input: "CREATE TABLE item(value TEXT); INSERT INTO item VALUES ('kept');\n" });
		writeFileSync(canaryPath, "HOST_CANARY_UNCHANGED", { mode: 0o600 });
		const databaseBefore = sha256(databasePath);
		const canaryBefore = sha256(canaryPath);
		const rowCountBefore = runBounded("sqlite3", ["-readonly", databasePath], { input: "SELECT count(*) FROM item;\n" }).trim();
		const queryResult = executeReadOnlyQuery({ databasePath, query: "SELECT value FROM item", format: "json" });
		assert.match(queryResult.text, /kept/);
		for (const attack of ["CREATE TABLE stolen(value)", "ATTACH 'outside.db' AS outside", "SELECT writefile('outside.txt','x')"]) {
			assert.throws(() => validateReadOnlyQuery(attack), /QUERY_REJECTED/);
		}
		assert.equal(sha256(databasePath), databaseBefore, "database.database-state.unchanged");
		assert.equal(sha256(canaryPath), canaryBefore, "database.host-state.unchanged");
		assert.equal(runBounded("sqlite3", ["-readonly", databasePath], { input: "SELECT count(*) FROM item;\n" }).trim(), rowCountBefore);
		for (const suffix of ["-wal", "-shm", "-journal"]) assert.equal(existsSync(`${databasePath}${suffix}`), false);
	} finally {
		rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("[database.errors.sanitized-bounded] oversized MCP input produces one bounded typed response", () => {
	const [response] = runMcp([{
		jsonrpc: "2.0",
		id: 1,
		method: "tools/call",
		params: { name: "db_query", arguments: { databasePath: "fixture.db", query: "x".repeat(1024 * 1024 + 1) } },
	}]);
	assert.equal(response.error?.code, -32600);
	assert.match(response.error?.message ?? "", /Input limit exceeded/);
	assert.ok(Buffer.byteLength(JSON.stringify(response)) <= 2048);
});

test("owned production modules remain below the 250 pure-LOC ceiling", () => {
	for (const path of [serverPath, sqliteModulePath, redactionModulePath]) {
		const lines = readFileSync(path, "utf8").split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith("//"));
		assert.ok(lines.length <= 250, `${path}: ${lines.length} pure LOC`);
	}
});
