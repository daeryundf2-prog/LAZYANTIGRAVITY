// SSRF guard helpers shared by research-mcp fetch paths.
// First-step split of cli.mjs: only isPrivateIp/validateSafeUrl/assertFinalUrlSafe
// live here so SSRF policy stays in one reviewable unit.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import http from "node:http";
import https from "node:https";

export function isPrivateIp(ip) {
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

export async function validateSafeUrl(rawUrl) {
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
	} 	else {
		try {
			const addresses = await lookup(hostname, { all: true });
			for (const entry of addresses) {
				if (isPrivateIp(entry.address)) {
					return { ok: false, error: `Host '${hostname}' resolves to a private/loopback address and is rejected.` };
				}
			}
		} catch (err) {
			return { ok: false, error: `DNS resolution failed for '${hostname}': ${err instanceof Error ? err.message : String(err)}` };
		}
	}
	return { ok: true, url: parsed.href };
}

export async function assertFinalUrlSafe(finalUrl, originalUrl) {
	if (!finalUrl || finalUrl === originalUrl) return { ok: true };
	const recheck = await validateSafeUrl(finalUrl);
	if (!recheck.ok) {
		return { ok: false, error: `Redirect target rejected: ${recheck.error}` };
	}
	return { ok: true, url: recheck.url };
}

// Minimal fetch-Response facade over http(s).IncomingMessage so callers that use
// .ok/.status/.statusText/.headers.get()/.text() work unchanged.
function wrapIncomingMessage(res, body) {
	const h = res.headers;
	return {
		ok: res.statusCode >= 200 && res.statusCode < 300,
		status: res.statusCode,
		statusText: res.statusMessage || "",
		headers: { get: (name) => { const v = h[String(name).toLowerCase()]; return Array.isArray(v) ? v.join(", ") : (v ?? null); } },
		body: new ReadableStream({ start(controller) { controller.enqueue(body); controller.close(); } }),
		text: () => Promise.resolve(body.toString("utf8")),
		json: () => Promise.resolve(JSON.parse(body.toString("utf8"))),
	};
}

// dnsPin: resolve once, validate all answers, then connect to the pinned IP while
// keeping the real hostname for SNI/Host/TLS — closes the validate→fetch TOCTOU
// (DNS rebinding) window on both http and https without breaking certificates.
function pinnedRequest(url, { headers = {}, signal, pinnedAddrs }) {
	return new Promise((resolve, reject) => {
		const parsed = new URL(url);
		const mod = parsed.protocol === "https:" ? https : http;
		const pinned = pinnedAddrs[0];
		const req = mod.request(parsed, {
			method: "GET",
			headers,
			servername: parsed.hostname,
			lookup: (_host, opts, cb) => (opts && opts.all)
				? cb(null, pinnedAddrs.map((a) => ({ address: a.address, family: a.family })))
				: cb(null, pinned.address, pinned.family),
		}, (res) => {
			const chunks = [];
			let bytes = 0;
			res.on("data", (c) => {
				bytes += c.length;
				if (bytes > 2 * 1024 * 1024) {
					const error = new Error("Response exceeds byte limit");
					res.destroy(error);
					req.destroy(error);
					reject(error);
					return;
				}
				chunks.push(c);
			});
			res.on("end", () => resolve(wrapIncomingMessage(res, Buffer.concat(chunks))));
			res.on("error", reject);
		});
		req.on("error", reject);
		if (signal) {
			const onAbort = () => req.destroy(new Error("aborted"));
			if (signal.aborted) onAbort();
			else {
				signal.addEventListener("abort", onAbort, { once: true });
				req.on("close", () => signal.removeEventListener("abort", onAbort));
			}
		}
		req.end();
	});
}

async function resolvePinnedAddrs(hostname) {
	const addrs = await lookup(hostname, { all: true });
	const safe = addrs.filter((a) => !isPrivateIp(a.address));
	return safe.length > 0 ? safe : [];
}

export async function fetchWithSafeRedirects(initialUrl, fetchOptions = {}, maxHops = 5, options = {}) {
	let currentUrl = initialUrl;
	let hops = 0;
	const httpOnlyPin = options.httpOnlyPin === true || fetchOptions.httpOnlyPin === true;
	const dnsPin = options.dnsPin === true || fetchOptions.dnsPin === true;

	while (hops <= maxHops) {
		// fetch 직전 이중 검증 (DNS rebinding 완화; 다단계 사전 점검)
		const check = await validateSafeUrl(currentUrl);
		if (!check.ok) {
			return { ok: false, error: check.error, finalUrl: currentUrl };
		}
		// dnsPin: HTTPS 포함 전 프로토콜에 검증된 IP로 직접 연결 (SNI는 호스트명 유지).
		let res;
		if (dnsPin) {
			const parsed = new URL(currentUrl);
			const pinnedAddrs = isIP(parsed.hostname)
				? [{ address: parsed.hostname, family: parsed.hostname.includes(":") ? 6 : 4 }]
				: await resolvePinnedAddrs(parsed.hostname);
			if (pinnedAddrs.length === 0) {
				return { ok: false, error: `dnsPin: no safe addresses resolved for '${parsed.hostname}'.`, finalUrl: currentUrl };
			}
			try {
				res = await pinnedRequest(currentUrl, { headers: fetchOptions.headers || {}, signal: fetchOptions.signal, pinnedAddrs });
			} catch (err) {
				return { ok: false, error: err instanceof Error ? err.message : String(err), finalUrl: currentUrl };
			}
			if (![301, 302, 303, 307, 308].includes(res.status)) {
				return { ok: true, response: res, finalUrl: currentUrl };
			}
			const location = res.headers.get("location");
			if (!location) {
				return { ok: false, error: `Redirect HTTP ${res.status} without Location header`, finalUrl: currentUrl };
			}
			hops++;
			if (hops > maxHops) {
				return { ok: false, error: `Exceeded maximum redirect limit of ${maxHops} hops`, finalUrl: currentUrl };
			}
			try {
				currentUrl = new URL(location, currentUrl).href;
			} catch {
				return { ok: false, error: `Invalid redirect location: '${location}'`, finalUrl: currentUrl };
			}
			continue;
		}
		// httpOnlyPin: 확인된 IP로의 Host 재요청은 HTTP에만 적용 (HTTPS는 인증서 문제로 경고+차단).
		let requestUrl = currentUrl, pinHeaders = {};
		if (httpOnlyPin) {
			const parsed = new URL(currentUrl);
			if (parsed.protocol === "https:") { console.warn("[ssrf] httpOnlyPin: HTTPS pinning blocked (certificate mismatch risk)."); return { ok: false, error: "httpOnlyPin: HTTPS host pinning is blocked (certificate mismatch risk).", finalUrl: currentUrl }; }
			if (parsed.protocol === "http:" && !isIP(parsed.hostname)) {
				const addrs = await lookup(parsed.hostname, { all: true });
				const ip = addrs.length > 0 ? addrs[0].address : "";
				if (!ip || isPrivateIp(ip)) return { ok: false, error: `httpOnlyPin: resolved IP '${ip}' is not safe.`, finalUrl: currentUrl };
				const origHost = parsed.host; parsed.hostname = ip; requestUrl = parsed.href; pinHeaders = { Host: origHost };
			}
		}
		try {
			res = await fetch(requestUrl, { ...fetchOptions, headers: { ...(fetchOptions.headers || {}), ...pinHeaders }, redirect: "manual" });
		} catch (err) {
			return { ok: false, error: err instanceof Error ? err.message : String(err), finalUrl: currentUrl };
		}

		// 301, 302, 303, 307, 308 redirect inspection
		if ([301, 302, 303, 307, 308].includes(res.status)) {
			const location = res.headers.get("location");
			if (!location) {
				return { ok: false, error: `Redirect HTTP ${res.status} without Location header`, finalUrl: currentUrl };
			}
			hops++;
			if (hops > maxHops) {
				return { ok: false, error: `Exceeded maximum redirect limit of ${maxHops} hops`, finalUrl: currentUrl };
			}
			try {
				currentUrl = new URL(location, currentUrl).href;
			} catch {
				return { ok: false, error: `Invalid redirect location: '${location}'`, finalUrl: currentUrl };
			}
			continue;
		}

		return { ok: true, response: res, finalUrl: currentUrl };
	}

	return { ok: false, error: `Exceeded maximum redirect limit of ${maxHops} hops`, finalUrl: currentUrl };
}

export function redactSecrets(text) {
	if (typeof text !== "string") return text;
	return text
		.replace(/(api[_-]?key\s*[:=]\s*)(['"]?)[^\s,'"}]+(\2)/gi, "$1$2[REDACTED]$3")
		.replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+/gi, "$1[REDACTED]")
		.replace(/((?:password|passwd|pwd|secret|token)\s*[:=]\s*)(['"]?)[^\s,'"};]+(\2)/gi, "$1$2[REDACTED]$3");
}
