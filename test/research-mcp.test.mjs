import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SERVER = join(ROOT, "research-mcp", "dist", "cli.js");

function callTool(name, args, env = {}) {
	const res = spawnSync(process.execPath, [SERVER, "mcp"], {
		input: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
		encoding: "utf8",
		timeout: 30000,
		cwd: ROOT,
		env: { ...process.env, ...env },
	});
	assert.equal(res.status, 0, res.stderr);
	const output = JSON.parse(res.stdout);
	assert.ok(output.result, JSON.stringify(output));
	return JSON.parse(output.result.content[0].text);
}

test("research-mcp exposes the research tools including cross_lingual_query", () => {
	const res = spawnSync(process.execPath, [SERVER, "mcp"], {
		input: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
		encoding: "utf8",
		timeout: 15000,
		cwd: ROOT,
	});
	assert.equal(res.status, 0, res.stderr);
	const tools = JSON.parse(res.stdout).result.tools.map((t) => t.name);
	assert.deepEqual(tools, ["web_read", "web_search", "fetch_json", "cross_lingual_query"]);
});

test("cross_lingual_query expands Korean domain queries into English primary source formulations (Feature 13)", () => {
	const res = callTool("cross_lingual_query", { query: "환각 억제 및 원자적 사실 동적 검색 그라운딩" });
	assert.equal(res.ok, true);
	assert.equal(res.primary_language, "ko");
	assert.equal(res.target_language, "en");
	assert.ok(Array.isArray(res.expanded_english_queries));
	assert.ok(res.expanded_english_queries.some((q) => q.includes("hallucination mitigation") || q.includes("atomic facts")));
});

test("research tools are gated behind LAZYANTIGRAVITY_RESEARCH_NETWORK=1", () => {
	// Explicitly clear the network env var for gating assertion
	const noNetEnv = { LAZYANTIGRAVITY_RESEARCH_NETWORK: "0" };

	const readRes = callTool("web_read", { url: "https://example.com" }, noNetEnv);
	assert.equal(readRes.ok, false);
	assert.match(readRes.error, /LAZYANTIGRAVITY_RESEARCH_NETWORK=1/);

	const searchRes = callTool("web_search", { query: "whisper.cpp" }, noNetEnv);
	assert.equal(searchRes.ok, false);
	assert.match(searchRes.error, /LAZYANTIGRAVITY_RESEARCH_NETWORK=1/);

	const jsonRes = callTool("fetch_json", { url: "https://api.github.com/repos/ggml-org/whisper.cpp" }, noNetEnv);
	assert.equal(jsonRes.ok, false);
	assert.match(jsonRes.error, /LAZYANTIGRAVITY_RESEARCH_NETWORK=1/);
});

test("research tools reject localhost, invalid protocols, and private IP addresses", async () => {
	const netEnv = { LAZYANTIGRAVITY_RESEARCH_NETWORK: "1" };

	const privateTargets = [
		"http://localhost",
		"http://localhost:8080/test",
		"http://127.0.0.1:3000",
		"http://10.0.0.1/admin",
		"http://192.168.1.1/secret",
		"http://172.16.0.1/config",
		"file:///etc/passwd",
		"ftp://example.com",
	];

	for (const target of privateTargets) {
		const readRes = callTool("web_read", { url: target }, netEnv);
		assert.equal(readRes.ok, false, `web_read must reject ${target}`);

		const jsonRes = callTool("fetch_json", { url: target }, netEnv);
		assert.equal(jsonRes.ok, false, `fetch_json must reject ${target}`);
	}
});

test("web_search degrades honestly when no keys are configured", () => {
	const netEnv = {
		LAZYANTIGRAVITY_RESEARCH_NETWORK: "1",
		LAZYANTIGRAVITY_TAVILY_KEY: "",
		TAVILY_API_KEY: "",
		LAZYANTIGRAVITY_BRAVE_KEY: "",
		BRAVE_API_KEY: "",
		LAZYANTIGRAVITY_JINA_KEY: "",
		JINA_API_KEY: "",
	};

	const res = callTool("web_search", { query: "whisper.cpp" }, netEnv);
	// Either returns duckduckgo results or honest error without crashing
	if (res.ok) {
		assert.equal(res.provider, "duckduckgo");
		assert.ok(Array.isArray(res.results));
	} else {
		assert.match(res.error, /No search provider configured|DuckDuckGo/i);
	}
});

test("live smoke tests run only when opt-in is explicitly enabled", async () => {
	if (process.env["LAZYANTIGRAVITY_RESEARCH_NETWORK"] !== "1" || process.env["RESEARCH_LIVE"] !== "1") {
		return; // CI skips live external network calls
	}

	const netEnv = { LAZYANTIGRAVITY_RESEARCH_NETWORK: "1" };
	const read = callTool("web_read", { url: "https://example.com" }, netEnv);
	assert.equal(read.ok, true);
	assert.match(read.content, /Example Domain/i);

	const json = callTool("fetch_json", { url: "https://api.github.com/repos/ggml-org/whisper.cpp" }, netEnv);
	assert.equal(json.ok, true);
	assert.equal(json.data?.name, "whisper.cpp");
});
