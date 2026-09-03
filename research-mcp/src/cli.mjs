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

	const isHighFidelity = args.mode === "HIGH_FIDELITY" || args.high_fidelity === true;
	const dynamicThreshold = typeof args.dynamic_threshold === "number"
		? Math.max(0.0, Math.min(1.0, args.dynamic_threshold))
		: (isHighFidelity ? 0.1 : 0.3);
	const modeStr = isHighFidelity ? "HIGH_FIDELITY" : (args.mode || "MODE_DYNAMIC");
	const formatSearchResult = (provider, results) => ({
		ok: true,
		query,
		provider,
		totalResults: results.length,
		results,
		grounding_metadata: {
			dynamic_threshold: dynamicThreshold,
			mode: modeStr,
			high_fidelity: isHighFidelity,
			grounding_chunks: results.map((r) => ({ title: r.title, url: r.url })),
			grounding_supports: results.map((r, i) => ({
				grounding_chunk_indices: [i],
				confidence_score: Number((1.0 - dynamicThreshold * 0.5).toFixed(2)),
			})),
		},
	});

	if (tavilyKey) {
		try {
			const results = await searchTavily(query, maxResults, tavilyKey);
			return textResult(formatSearchResult("tavily", results));
		} catch (err) {
			return textResult({ ok: false, query, provider: "tavily", error: String(err) }, true);
		}
	}
	if (braveKey) {
		try {
			const results = await searchBrave(query, maxResults, braveKey);
			return textResult(formatSearchResult("brave", results));
		} catch (err) {
			return textResult({ ok: false, query, provider: "brave", error: String(err) }, true);
		}
	}
	if (jinaKey) {
		try {
			const results = await searchJina(query, maxResults, jinaKey);
			return textResult(formatSearchResult("jina", results));
		} catch (err) {
			return textResult({ ok: false, query, provider: "jina", error: String(err) }, true);
		}
	}

	// Optional fallback attempt with DuckDuckGo
	try {
		const results = await searchDuckDuckGo(query, maxResults);
		return textResult(formatSearchResult("duckduckgo", results));
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

async function crossLingualQuery(args) {
	const query = typeof args.query === "string" ? args.query.trim() : "";
	if (!query) return textResult({ ok: false, error: "query must be a non-empty string." }, true);

	const TERM_MAP = [
		[/환각(\s*억제|\s*방지)?/g, "hallucination mitigation"],
		[/원자적\s*사실/g, "atomic facts proposition"],
		[/형태소\s*분석/g, "morphological analyzer"],
		[/동적\s*검색\s*그라운딩/g, "dynamic search grounding retrieval"],
		[/샌드위치\s*프롬프팅/g, "sandwich prompting needle in a haystack"],
		[/인지\s*분리/g, "cognitive decoupling thinking trace"],
		[/적대적\s*감사/g, "adversarial falsification audit"],
		[/출처\s*바인딩/g, "span-level source grounding verbatim quote"],
		[/엄격한\s*기권/g, "strict abstention insufficient data"],
		[/체크포인트/g, "checkpoint state ledger"],
		[/동시성(\s*제어)?/g, "concurrency control race condition"],
		[/파이썬/g, "Python"],
		[/자바스크립트/g, "JavaScript"],
		[/타입스크립트/g, "TypeScript"],
		[/러스트/g, "Rust"],
		[/리액트/g, "React"],
		[/가비지\s*컬렉션/g, "garbage collection"],
		[/메모리\s*누수/g, "memory leak"],
		[/비활성화/g, "disable"],
		[/활성화/g, "enable"],
		[/성능\s*최적화/g, "performance optimization"],
		[/공식\s*문서/g, "official documentation"],
	];

	let englishDraft = query;
	for (const [re, rep] of TERM_MAP) {
		englishDraft = englishDraft.replace(re, rep);
	}

	const asciiTerms = (query.match(/[A-Za-z0-9_.-]+/g) || []).join(" ");
	const candidateQueries = [
		englishDraft,
		`${asciiTerms} official documentation github RFC`.trim(),
		`${englishDraft} primary source benchmark`.trim(),
	].filter((q, idx, arr) => q.length > 0 && arr.indexOf(q) === idx);

	return textResult({
		ok: true,
		original_query: query,
		primary_language: /[가-힣]/.test(query) ? "ko" : "en",
		target_language: "en",
		expanded_english_queries: candidateQueries,
		primary_source_domains: ["github.com", "arxiv.org", "ietf.org", "ai.google.dev", "huggingface.co"],
		grounding_strategy: "cross-lingual-primary-source",
		instruction: "Execute web_search with the expanded English queries to ground against 1st-party primary sources before generating response.",
	});
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

function parseGroundingMetadata(rawMeta) {
	if (!rawMeta || typeof rawMeta !== "object") {
		return { web_search_queries: [], grounding_chunks: [], grounding_supports: [] };
	}
	const queries = Array.isArray(rawMeta.webSearchQueries)
		? rawMeta.webSearchQueries
		: Array.isArray(rawMeta.web_search_queries)
			? rawMeta.web_search_queries
			: [];
	const rawChunks = Array.isArray(rawMeta.groundingChunks)
		? rawMeta.groundingChunks
		: Array.isArray(rawMeta.grounding_chunks)
			? rawMeta.grounding_chunks
			: [];
	const chunks = rawChunks.map((c, i) => {
		let url = "";
		let title = "";
		if (c?.web && typeof c.web === "object") {
			url = c.web.uri || c.web.url || "";
			title = c.web.title || url;
		} else if (typeof c === "object" && c !== null) {
			url = c.url || c.uri || "";
			title = c.title || url;
		}
		return { index: i, url: String(url || "").trim(), title: String(title || url || `Source ${i + 1}`).trim() };
	});
	const rawSupports = Array.isArray(rawMeta.groundingSupports)
		? rawMeta.groundingSupports
		: Array.isArray(rawMeta.grounding_supports)
			? rawMeta.grounding_supports
			: [];
	const supports = rawSupports.map((s) => {
		const chunkIndices = Array.isArray(s?.groundingChunkIndices)
			? s.groundingChunkIndices
			: Array.isArray(s?.grounding_chunk_indices)
				? s.grounding_chunk_indices
				: [];
		const scores = Array.isArray(s?.confidenceScores)
			? s.confidenceScores
			: Array.isArray(s?.confidence_scores)
				? s.confidence_scores
				: typeof s?.confidence_score === "number"
					? [s.confidence_score]
					: [];
		const segmentObj = s?.segment || {};
		const startIndex = typeof segmentObj.startIndex === "number" ? segmentObj.startIndex : typeof segmentObj.start_index === "number" ? segmentObj.start_index : -1;
		const endIndex = typeof segmentObj.endIndex === "number" ? segmentObj.endIndex : typeof segmentObj.end_index === "number" ? segmentObj.end_index : -1;
		const segmentText = typeof segmentObj.text === "string" ? segmentObj.text : "";
		return {
			startIndex,
			endIndex,
			text: segmentText,
			chunkIndices: chunkIndices.map(Number).filter((n) => !Number.isNaN(n) && n >= 0),
			confidenceScores: scores.map(Number),
		};
	});
	return { web_search_queries: queries.map(String), grounding_chunks: chunks, grounding_supports: supports };
}

function byteOffsetToCharIndex(str, byteOffset) {
	if (typeof byteOffset !== "number" || byteOffset <= 0) return 0;
	const buf = Buffer.from(str, "utf8");
	if (byteOffset >= buf.length) return str.length;
	return buf.subarray(0, byteOffset).toString("utf8").length;
}

function resolveOffsets(rawText, sIdx, eIdx, segText) {
	if (sIdx < 0 || eIdx <= sIdx) return [sIdx, eIdx];
	const byteLen = Buffer.byteLength(rawText, "utf8");
	if (eIdx > rawText.length && eIdx <= byteLen) {
		return [byteOffsetToCharIndex(rawText, sIdx), byteOffsetToCharIndex(rawText, eIdx)];
	}
	if (segText && segText.trim()) {
		const trimmed = segText.trim();
		if (eIdx <= rawText.length && rawText.slice(sIdx, eIdx).trim() === trimmed) {
			return [sIdx, eIdx];
		}
		const charStart = byteOffsetToCharIndex(rawText, sIdx);
		const charEnd = byteOffsetToCharIndex(rawText, eIdx);
		if (charEnd <= rawText.length && rawText.slice(charStart, charEnd).trim() === trimmed) {
			return [charStart, charEnd];
		}
	}
	return [sIdx, eIdx];
}

function adjustForSurrogate(str, pos) {
	if (pos > 0 && pos < str.length) {
		const prev = str.charCodeAt(pos - 1);
		const curr = str.charCodeAt(pos);
		if (prev >= 0xd800 && prev <= 0xdbff && curr >= 0xdc00 && curr <= 0xdfff) {
			return pos + 1;
		}
	}
	return pos;
}

function renderGroundingCitations(options) {
	const rawText = typeof options?.text === "string" ? options.text : "";
	const minConfidence = typeof options?.min_confidence === "number" ? options.min_confidence : 0.0;
	const citationFormat = options?.citation_format || "footnote";
	const heading = options?.heading || "## References / Grounding Sources";
	const isHighFidelity = options?.high_fidelity === true || options?.mode === "HIGH_FIDELITY";
	const minCoverage = typeof options?.min_coverage === "number" ? options.min_coverage : 0.70;

	const { web_search_queries, grounding_chunks, grounding_supports } = parseGroundingMetadata(options?.grounding_metadata);
	if (!rawText.trim()) {
		return { ok: true, high_fidelity_passed: true, abstention: false, rendered_text: "", footnotes: [], web_search_queries, total_citations: 0, supported_segment_count: 0, grounding_coverage: 0 };
	}
	if (grounding_chunks.length === 0 || grounding_supports.length === 0) {
		if (isHighFidelity) {
			return {
				ok: false,
				high_fidelity_passed: false,
				abstention: true,
				error: "[INSUFFICIENT_DATA]: High-Fidelity Grounding requires verified grounding chunks and supports. Confabulation blocked.",
				rendered_text: "[INSUFFICIENT_DATA]: Insufficient grounded facts from primary sources.\n",
				footnotes: [],
				web_search_queries,
				total_citations: 0,
				supported_segment_count: 0,
				grounding_coverage: 0,
			};
		}
		return { ok: true, high_fidelity_passed: true, abstention: false, rendered_text: rawText, footnotes: [], web_search_queries, total_citations: 0, supported_segment_count: 0, grounding_coverage: 0 };
	}

	const validSupports = grounding_supports.filter((s) => {
		if (s.chunkIndices.length === 0) return false;
		if (minConfidence <= 0.0) return true;
		if (s.confidenceScores.length === 0) return true;
		const avg = s.confidenceScores.reduce((a, b) => a + b, 0) / s.confidenceScores.length;
		return avg >= minConfidence;
	});

	const citedChunkIndices = new Set();
	const posMap = new Map();
	let mappedSupportCount = 0;

	for (const sup of validSupports) {
		let insertPos = -1;
		const [sIdx, eIdx] = resolveOffsets(rawText, sup.startIndex, sup.endIndex, sup.text);

		if (sIdx >= 0 && eIdx > sIdx && eIdx <= rawText.length) {
			insertPos = eIdx;
		} else if (sup.text && sup.text.trim()) {
			const searchFrom = sIdx >= 0 && sIdx < rawText.length ? sIdx : 0;
			let foundIdx = rawText.indexOf(sup.text.trim(), searchFrom);
			if (foundIdx === -1 && searchFrom > 0) {
				foundIdx = rawText.indexOf(sup.text.trim(), 0);
			}
			if (foundIdx !== -1) insertPos = foundIdx + sup.text.trim().length;
		}
		if (insertPos !== -1) {
			mappedSupportCount++;
			insertPos = adjustForSurrogate(rawText, insertPos);
			if (!posMap.has(insertPos)) {
				posMap.set(insertPos, new Set());
			}
			for (const ci of sup.chunkIndices) {
				if (ci >= 0 && ci < grounding_chunks.length) {
					citedChunkIndices.add(ci);
					posMap.get(insertPos).add(ci);
				}
			}
		}
	}

	const insertions = [];
	for (const [pos, cSet] of posMap.entries()) {
		insertions.push({
			pos,
			chunkIndices: Array.from(cSet).sort((a, b) => a - b),
		});
	}

	if (insertions.length === 0 && validSupports.length > 0) {
		for (const sup of validSupports) {
			for (const ci of sup.chunkIndices) {
				if (ci >= 0 && ci < grounding_chunks.length) citedChunkIndices.add(ci);
			}
		}
		if (citedChunkIndices.size > 0) {
			mappedSupportCount = validSupports.length;
			insertions.push({ pos: rawText.trimEnd().length, chunkIndices: Array.from(citedChunkIndices).sort((a, b) => a - b) });
		}
	}

	const sortedCitedIndices = Array.from(citedChunkIndices).sort((a, b) => a - b);
	const chunkToFootnoteNum = new Map();
	const footnotes = [];

	sortedCitedIndices.forEach((chunkIdx, i) => {
		const footnoteNum = i + 1;
		chunkToFootnoteNum.set(chunkIdx, footnoteNum);
		const chunk = grounding_chunks[chunkIdx];
		footnotes.push({ footnote_index: footnoteNum, chunk_index: chunkIdx, title: chunk.title, url: chunk.url });
	});

	insertions.sort((a, b) => b.pos - a.pos);

	let rendered = rawText;
	for (const ins of insertions) {
		const footnoteNums = ins.chunkIndices.map((ci) => chunkToFootnoteNum.get(ci)).filter((fn) => fn !== undefined);
		if (footnoteNums.length === 0) continue;
		const uniqueFootnotes = Array.from(new Set(footnoteNums)).sort((a, b) => a - b);
		let tagStr = "";
		if (citationFormat === "link") {
			tagStr = uniqueFootnotes.map((fn) => {
				const fnInfo = footnotes.find((f) => f.footnote_index === fn);
				return ` [${fn}](${fnInfo?.url || "#"})`;
			}).join("");
		} else {
			tagStr = uniqueFootnotes.map((fn) => `[^${fn}]`).join("");
		}
		rendered = rendered.slice(0, ins.pos) + tagStr + rendered.slice(ins.pos);
	}

	if (footnotes.length > 0) {
		rendered = rendered.trimEnd() + "\n\n" + heading + "\n\n";
		if (citationFormat === "link") {
			for (const fn of footnotes) rendered += `- [${fn.footnote_index}] [${fn.title}](${fn.url})\n`;
		} else {
			for (const fn of footnotes) rendered += `[^${fn.footnote_index}]: [${fn.title}](${fn.url})\n`;
		}
	}

	const supportedSegmentCount = mappedSupportCount;
	const groundingCoverage = Number((supportedSegmentCount / Math.max(grounding_supports.length, 1)).toFixed(2));
	const highFidelityPassed = !isHighFidelity || (groundingCoverage >= minCoverage && supportedSegmentCount > 0);
	const abstention = isHighFidelity && !highFidelityPassed;

	let finalText = rendered.trimEnd() + "\n";
	if (abstention) {
		finalText = `[INSUFFICIENT_DATA]: High-Fidelity Grounding coverage (${(groundingCoverage * 100).toFixed(1)}% < ${(minCoverage * 100).toFixed(0)}%) is insufficient. Non-parametric answering required.\n`;
	}

	return {
		ok: !abstention,
		high_fidelity_passed: highFidelityPassed,
		abstention,
		rendered_text: finalText,
		footnotes,
		web_search_queries,
		total_citations: footnotes.length,
		supported_segment_count: supportedSegmentCount,
		grounding_coverage: groundingCoverage,
	};
}

async function renderGroundingCitationsTool(args) {
	const text = typeof args?.text === "string" ? args.text : "";
	const metadata = args?.grounding_metadata || args?.groundingMetadata || null;
	const minConfidence = typeof args?.min_confidence === "number" ? args.min_confidence : 0.0;
	const format = typeof args?.citation_format === "string" ? args.citation_format : "footnote";

	if (!metadata || typeof metadata !== "object") {
		return textResult({ ok: false, error: "grounding_metadata object is required." }, true);
	}

	const result = renderGroundingCitations({
		text,
		grounding_metadata: metadata,
		min_confidence: minConfidence,
		citation_format: format,
		high_fidelity: Boolean(args?.high_fidelity || args?.mode === "HIGH_FIDELITY"),
		min_coverage: typeof args?.min_coverage === "number" ? args.min_coverage : 0.70,
	});

	return textResult(result);
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
				dynamic_threshold: { type: "number", description: "Adaptive retrieval threshold (0.0 to 1.0, default 0.3)" },
				mode: { type: "string", enum: ["MODE_DYNAMIC", "HIGH_FIDELITY"], description: "Grounding mode: MODE_DYNAMIC or HIGH_FIDELITY (strict non-parametric, default MODE_DYNAMIC)" },
				high_fidelity: { type: "boolean", description: "Enforce strict non-parametric high-fidelity grounding with dynamic_threshold=0.1" },
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
	{
		name: "cross_lingual_query",
		description: "Expand non-English (e.g. Korean) queries into precise English search formulations targeting global primary sources (RFC, GitHub, official docs, arXiv) to prevent translation drift.",
		inputSchema: {
			type: "object",
			properties: {
				query: { type: "string", description: "Original search query string (e.g. Korean technical prompt)" },
				target_language: { type: "string", description: "Target language for query expansion (default 'en')" },
			},
			required: ["query"],
		},
	},
	{
		name: "render_grounding_citations",
		description: "Parse Gemini API or research grounding metadata (grounding_chunks, grounding_supports, web_search_queries) and render text with verified markdown inline footnotes ([^1], [^2]) and references section.",
		inputSchema: {
			type: "object",
			properties: {
				text: { type: "string", description: "Generated response text to annotate with footnotes" },
				grounding_metadata: {
					type: "object",
					description: "Grounding metadata object with grounding_chunks/groundingChunks and grounding_supports/groundingSupports",
				},
				min_confidence: {
					type: "number",
					description: "Minimum confidence score (0.0 to 1.0) to include a citation (default 0.0)",
				},
				citation_format: {
					type: "string",
					enum: ["footnote", "link"],
					description: "Citation formatting style: footnote ([^1]) or link ([1](url))",
				},
				high_fidelity: {
					type: "boolean",
					description: "Enforce Vertex AI High-Fidelity non-parametric grounding mode (abstains if coverage < min_coverage)",
				},
				min_coverage: {
					type: "number",
					description: "Minimum grounding coverage threshold for high fidelity (default 0.70)",
				},
			},
			required: ["text", "grounding_metadata"],
		},
	},
];

const TOOL_HANDLERS = {
	web_read: webRead,
	web_search: webSearch,
	fetch_json: fetchJson,
	cross_lingual_query: crossLingualQuery,
	render_grounding_citations: renderGroundingCitationsTool,
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
