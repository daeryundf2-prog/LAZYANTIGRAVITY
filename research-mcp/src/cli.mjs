#!/usr/bin/env node
// Research MCP server: web_read, web_search, fetch_json with
// explicit network opt-in gate (LAZYANTIGRAVITY_RESEARCH_NETWORK=1)
// and SSRF protection (localhost / private IP blocking).
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { resolve, sep } from "node:path";
import { createInterface } from "node:readline";

// Startup guard (same contract as the other bundled servers).
const pluginRootEnv = process.env["PLUGIN_ROOT"];
if (pluginRootEnv) {
	const cwd = resolve(process.cwd());
	const root = resolve(pluginRootEnv);
	if (cwd === root || cwd.startsWith(root + sep)) {
		process.stderr.write(
			`[research-mcp] WARNING: cwd is inside PLUGIN_ROOT (${pluginRootEnv}); research tools should run in the user's workspace. Set the server "cwd" to the user workspace in mcp_config.json, or set LAZYANTIGRAVITY_WORKSPACE_ROOT.\n`,
		);
	}
}

const MAX_OUTPUT_CHARS = 200_000;
const USER_AGENT_DIRECT = "Mozilla/5.0 (compatible; lazyantigravity-research/0.1.0; +https://github.com/daeryundf2-prog/LAZYANTIGRAVITY)";
const USER_AGENT_API = "lazyantigravity-research/0.1.0";

function textResult(payload, isError = false) {
	return {
		content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
		...(isError ? { isError: true } : {}),
	};
}

function truncate(text, max = MAX_OUTPUT_CHARS) {
	if (typeof text !== "string" || text.length <= max) return text;
	return `${text.slice(0, max)}\n[output truncated at ${max} chars]`;
}

function isPrivateIp(ip) {
	if (!ip || ip === "::1" || ip === "0.0.0.0" || ip === "::") return true;
	let candidate = ip;
	if (candidate.startsWith("::ffff:")) {
		candidate = candidate.slice(7);
	}
	const parts = candidate.split(".").map(Number);
	if (parts.length === 4 && parts.every((n) => !Number.isNaN(n) && n >= 0 && n <= 255)) {
		const [a, b] = parts;
		if (a === 0) return true; // 0.0.0.0/8
		if (a === 10) return true; // 10.0.0.0/8
		if (a === 127) return true; // 127.0.0.0/8
		if (a === 169 && b === 254) return true; // 169.254.0.0/16
		if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
		if (a === 192 && b === 168) return true; // 192.168.0.0/16
		return false;
	}
	const lower = candidate.toLowerCase();
	if (lower === "::1" || lower === "::") return true;
	if (lower.startsWith("fe80:") || lower.startsWith("fe90:") || lower.startsWith("fea0:") || lower.startsWith("feb0:")) return true;
	if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
	return false;
}

async function validateSafeUrl(rawUrl) {
	if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
		return { ok: false, error: "url must be a non-empty string." };
	}
	let parsed;
	try {
		parsed = new URL(rawUrl.trim());
	} catch {
		return { ok: false, error: `Invalid URL: '${rawUrl}'` };
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		return { ok: false, error: `Protocol '${parsed.protocol}' is not allowed. Only http: and https: are permitted.` };
	}
	const hostname = parsed.hostname;
	if (!hostname) {
		return { ok: false, error: `Missing hostname in URL: '${rawUrl}'` };
	}
	const lowerHost = hostname.toLowerCase();
	if (
		lowerHost === "localhost" ||
		lowerHost.endsWith(".localhost") ||
		lowerHost.endsWith(".local") ||
		lowerHost.endsWith(".internal")
	) {
		return { ok: false, error: `Access to local/internal host '${hostname}' is rejected.` };
	}
	if (isIP(hostname)) {
		if (isPrivateIp(hostname)) {
			return { ok: false, error: `Access to private/loopback IP '${hostname}' is rejected.` };
		}
	} else {
		try {
			const addresses = await lookup(hostname, { all: true });
			for (const entry of addresses) {
				if (isPrivateIp(entry.address)) {
					return { ok: false, error: `Host '${hostname}' resolves to private/loopback IP (${entry.address}) and is rejected.` };
				}
			}
		} catch (err) {
			return { ok: false, error: `DNS resolution failed for '${hostname}': ${err instanceof Error ? err.message : String(err)}` };
		}
	}
	return { ok: true, url: parsed.href };
}

function stripHtml(html) {
	if (typeof html !== "string") return "";
	return html
		.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
		.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
		.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ")
		.replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, " ")
		.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, " ")
		.replace(/<\/(?:p|div|h[1-6]|li|tr|section|article)>/gi, "\n")
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/[ \t\r]+/g, " ")
		.replace(/\n\s*\n\s*\n/g, "\n\n")
		.trim();
}

function checkNetworkGate() {
	if (process.env["LAZYANTIGRAVITY_RESEARCH_NETWORK"] !== "1") {
		return {
			ok: false,
			error:
				"research tools perform network egress and require the LAZYANTIGRAVITY_RESEARCH_NETWORK=1 " +
				"environment opt-in (set it in mcp_config.json env for this server).",
		};
	}
	return { ok: true };
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------
async function webRead(args) {
	const gate = checkNetworkGate();
	if (!gate.ok) return textResult({ ok: false, error: gate.error }, true);

	const urlCheck = await validateSafeUrl(args.url);
	if (!urlCheck.ok) return textResult({ ok: false, error: urlCheck.error }, true);
	const targetUrl = urlCheck.url;

	// 1. Try Jina Reader first (keyless clean markdown)
	try {
		const jinaUrl = `https://r.jina.ai/${targetUrl}`;
		const jinaRes = await fetch(jinaUrl, {
			signal: AbortSignal.timeout(30000),
			headers: {
				Accept: "text/markdown, text/plain",
				"User-Agent": USER_AGENT_DIRECT,
			},
		});
		if (jinaRes.ok) {
			const text = await jinaRes.text();
			if (text && text.trim().length > 0) {
				const trimmed = text.trim();
				return textResult({
					ok: true,
					url: targetUrl,
					finalUrl: jinaRes.url || targetUrl,
					content: truncate(trimmed),
					length: trimmed.length,
				});
			}
		}
	} catch {
		// Fall through to direct fetch
	}

	// 2. Direct fetch fallback
	try {
		const directRes = await fetch(targetUrl, {
			signal: AbortSignal.timeout(30000),
			headers: { "User-Agent": USER_AGENT_DIRECT },
		});
		if (!directRes.ok) {
			return textResult({ ok: false, url: targetUrl, error: `Direct fetch failed with HTTP ${directRes.status}` }, true);
		}
		const contentType = directRes.headers.get("content-type") || "";
		if (!/text|html|json|xml|markdown/i.test(contentType)) {
			return textResult({ ok: false, url: targetUrl, error: `Unsupported content-type: '${contentType}'` }, true);
		}
		const rawText = await directRes.text();
		const clean = /html/i.test(contentType) ? stripHtml(rawText) : rawText.trim();
		return textResult({
			ok: true,
			url: targetUrl,
			finalUrl: directRes.url || targetUrl,
			content: truncate(clean),
			length: clean.length,
		});
	} catch (err) {
		return textResult({ ok: false, url: targetUrl, error: `web_read failed: ${err instanceof Error ? err.message : String(err)}` }, true);
	}
}

async function searchTavily(query, maxResults, key) {
	const res = await fetch("https://api.tavily.com/search", {
		method: "POST",
		signal: AbortSignal.timeout(20000),
		headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT_API },
		body: JSON.stringify({ api_key: key, query, max_results: maxResults, search_depth: "basic" }),
	});
	if (!res.ok) throw new Error(`Tavily HTTP ${res.status}: ${await res.text()}`);
	const json = await res.json();
	return (json.results || []).map((r) => ({
		title: r.title || "",
		url: r.url || "",
		snippet: r.content || r.snippet || "",
	}));
}

async function searchBrave(query, maxResults, key) {
	const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}`;
	const res = await fetch(url, {
		signal: AbortSignal.timeout(20000),
		headers: { "X-Subscription-Token": key, Accept: "application/json", "User-Agent": USER_AGENT_API },
	});
	if (!res.ok) throw new Error(`Brave HTTP ${res.status}: ${await res.text()}`);
	const json = await res.json();
	return (json.web?.results || []).map((r) => ({
		title: r.title || "",
		url: r.url || "",
		snippet: r.description || "",
	}));
}

async function searchJina(query, maxResults, key) {
	const url = `https://s.jina.ai/${encodeURIComponent(query)}`;
	const res = await fetch(url, {
		signal: AbortSignal.timeout(20000),
		headers: { Authorization: `Bearer ${key}`, Accept: "application/json", "User-Agent": USER_AGENT_API },
	});
	if (!res.ok) throw new Error(`Jina Search HTTP ${res.status}: ${await res.text()}`);
	const json = await res.json();
	return (json.data || []).slice(0, maxResults).map((r) => ({
		title: r.title || "",
		url: r.url || "",
		snippet: r.description || r.content || "",
	}));
}

async function searchDuckDuckGo(query, maxResults) {
	const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
	const res = await fetch(url, {
		signal: AbortSignal.timeout(15000),
		headers: { "User-Agent": USER_AGENT_DIRECT },
	});
	if (!res.ok) throw new Error(`DuckDuckGo HTTP ${res.status}`);
	const html = await res.text();
	const results = [];
	const regex = /<a\s+class="result__url"[^>]*href="([^"]+)"[^>]*>[\s\S]*?<a\s+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
	let match;
	while ((match = regex.exec(html)) !== null && results.length < maxResults) {
		let href = match[1];
		if (href.includes("uddg=")) {
			const u = new URL(`https://duckduckgo.com${href}`);
			href = decodeURIComponent(u.searchParams.get("uddg") || href);
		}
		results.push({
			title: href,
			url: href,
			snippet: stripHtml(match[2]),
		});
	}
	if (results.length === 0) throw new Error("No DuckDuckGo HTML results parsed");
	return results;
}

async function webSearch(args) {
	const gate = checkNetworkGate();
	if (!gate.ok) return textResult({ ok: false, error: gate.error }, true);

	const query = typeof args.query === "string" ? args.query.trim() : "";
	if (!query) return textResult({ ok: false, error: "query must be a non-empty string." }, true);

	const maxResults = Math.min(Math.max(Number(args.maxResults) || 10, 1), 10);
	const tavilyKey = process.env["LAZYANTIGRAVITY_TAVILY_KEY"] || process.env["TAVILY_API_KEY"];
	const braveKey = process.env["LAZYANTIGRAVITY_BRAVE_KEY"] || process.env["BRAVE_API_KEY"];
	const jinaKey = process.env["LAZYANTIGRAVITY_JINA_KEY"] || process.env["JINA_API_KEY"];

	if (tavilyKey) {
		try {
			const results = await searchTavily(query, maxResults, tavilyKey);
			return textResult({ ok: true, query, provider: "tavily", totalResults: results.length, results });
		} catch (err) {
			return textResult({ ok: false, query, provider: "tavily", error: String(err) }, true);
		}
	}
	if (braveKey) {
		try {
			const results = await searchBrave(query, maxResults, braveKey);
			return textResult({ ok: true, query, provider: "brave", totalResults: results.length, results });
		} catch (err) {
			return textResult({ ok: false, query, provider: "brave", error: String(err) }, true);
		}
	}
	if (jinaKey) {
		try {
			const results = await searchJina(query, maxResults, jinaKey);
			return textResult({ ok: true, query, provider: "jina", totalResults: results.length, results });
		} catch (err) {
			return textResult({ ok: false, query, provider: "jina", error: String(err) }, true);
		}
	}

	// Optional fallback attempt with DuckDuckGo
	try {
		const results = await searchDuckDuckGo(query, maxResults);
		return textResult({ ok: true, query, provider: "duckduckgo", totalResults: results.length, results });
	} catch {
		// Honest error when no keys configured
		return textResult(
			{
				ok: false,
				query,
				error:
					"No search provider configured or available. Set one of LAZYANTIGRAVITY_TAVILY_KEY, " +
					"LAZYANTIGRAVITY_BRAVE_KEY, or LAZYANTIGRAVITY_JINA_KEY in environment, or use web_read on known URLs.",
			},
			true,
		);
	}
}

async function fetchJson(args) {
	const gate = checkNetworkGate();
	if (!gate.ok) return textResult({ ok: false, error: gate.error }, true);

	const urlCheck = await validateSafeUrl(args.url);
	if (!urlCheck.ok) return textResult({ ok: false, error: urlCheck.error }, true);
	const targetUrl = urlCheck.url;

	try {
		const res = await fetch(targetUrl, {
			signal: AbortSignal.timeout(20000),
			headers: { "User-Agent": USER_AGENT_API, Accept: "application/json, text/plain, */*" },
		});
		if (!res.ok) {
			return textResult({ ok: false, url: targetUrl, status: res.status, error: `HTTP ${res.status}: ${res.statusText}` }, true);
		}
		const text = await res.text();
		let data;
		try {
			data = JSON.parse(text);
		} catch {
			return textResult({ ok: false, url: targetUrl, status: res.status, error: "Response was not valid JSON" }, true);
		}
		return textResult({ ok: true, url: targetUrl, status: res.status, data });
	} catch (err) {
		return textResult({ ok: false, url: targetUrl, error: `fetch_json failed: ${err instanceof Error ? err.message : String(err)}` }, true);
	}
}

const TOOLS = [
	{
		name: "web_read",
		description: "Fetch web page content and convert to clean markdown/text via Jina Reader with direct-fetch fallback. Read-only; no file writes.",
		inputSchema: {
			type: "object",
			properties: {
				url: { type: "string", description: "HTTP/HTTPS URL to fetch and read" },
				format: { type: "string", enum: ["markdown", "text"], description: "Output format (default markdown)" },
			},
			required: ["url"],
		},
	},
	{
		name: "web_search",
		description: "Search the web via provider chain (Tavily -> Brave -> Jina -> DuckDuckGo). Returns normalized search result list.",
		inputSchema: {
			type: "object",
			properties: {
				query: { type: "string", description: "Search query string" },
				maxResults: { type: "number", description: "Maximum results to return (default 10, cap 10)" },
			},
			required: ["query"],
		},
	},
	{
		name: "fetch_json",
		description: "Fetch and parse JSON from public developer APIs (GitHub, npm, PyPI, arXiv, etc.) with SSRF protection.",
		inputSchema: {
			type: "object",
			properties: {
				url: { type: "string", description: "HTTP/HTTPS JSON API URL" },
			},
			required: ["url"],
		},
	},
];

const TOOL_HANDLERS = {
	web_read: webRead,
	web_search: webSearch,
	fetch_json: fetchJson,
};

async function handleJsonRpc(message) {
	if (!message || typeof message !== "object") return null;
	const { id, method, params } = message;
	if (method === "initialize") {
		return {
			jsonrpc: "2.0",
			id,
			result: {
				protocolVersion: "2024-11-05",
				capabilities: { tools: {} },
				serverInfo: { name: "research-mcp", version: "0.1.0" },
			},
		};
	}
	if (method === "notifications/initialized") return null;
	if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
	if (method === "tools/call") {
		const name = params?.name;
		const handler = TOOL_HANDLERS[name];
		if (!handler) {
			return { jsonrpc: "2.0", id, error: { code: -32602, message: `Unsupported tool: ${name}` } };
		}
		const result = await handler(params?.arguments ?? {});
		return { jsonrpc: "2.0", id, result };
	}
	return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
}

async function runMcpServer() {
	const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
	rl.on("line", async (line) => {
		const trimmed = line.trim();
		if (!trimmed) return;
		try {
			const req = JSON.parse(trimmed);
			const res = await handleJsonRpc(req);
			if (res) process.stdout.write(`${JSON.stringify(res)}\n`);
		} catch {
			process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })}\n`);
		}
	});
}

function main() {
	const argv = process.argv.slice(2);
	if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
		console.log("Usage: research-mcp <mcp> [options]");
		return 0;
	}
	if (argv[0] === "mcp") {
		runMcpServer();
		return 0;
	}
	console.log("[research-mcp] Standalone research CLI initialized.");
	return 0;
}

main();
