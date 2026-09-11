import test from "node:test";
import assert from "node:assert/strict";
import { fetchWithSafeRedirects } from "../research-mcp/src/lib/ssrf.mjs";

const PUBLIC = "http://93.184.216.34";

function mockResponse(status, location) {
	return {
		status,
		ok: status >= 200 && status < 300,
		headers: {
			get: (name) => (String(name).toLowerCase() === "location" ? location : null),
		},
		text: async () => "ok",
	};
}

test("fetchWithSafeRedirects rejects when redirects exceed 5 hops", async () => {
	const origFetch = globalThis.fetch;
	globalThis.fetch = async () => mockResponse(302, `${PUBLIC}/next`);
	try {
		const res = await fetchWithSafeRedirects(`${PUBLIC}/start`, {}, 5);
		assert.equal(res.ok, false);
		assert.match(res.error, /Exceeded maximum redirect/);
	} finally {
		globalThis.fetch = origFetch;
	}
});

test("fetchWithSafeRedirects rejects a mid-chain private IP redirect", async () => {
	const origFetch = globalThis.fetch;
	globalThis.fetch = async (url) => {
		if (String(url).startsWith(PUBLIC)) return mockResponse(302, "http://127.0.0.1/evil");
		return mockResponse(200, null);
	};
	try {
		const res = await fetchWithSafeRedirects(`${PUBLIC}/start`, {}, 5);
		assert.equal(res.ok, false);
		assert.match(res.error, /private|loopback|rejected/i);
	} finally {
		globalThis.fetch = origFetch;
	}
});

test("fetchWithSafeRedirects passes through a safe single response", async () => {
	const origFetch = globalThis.fetch;
	globalThis.fetch = async (url, opts) => {
		assert.equal(opts.redirect, "manual");
		return mockResponse(200, null);
	};
	try {
		const res = await fetchWithSafeRedirects(`${PUBLIC}/ok`, {}, 5);
		assert.equal(res.ok, true);
		assert.ok(String(res.finalUrl).startsWith(PUBLIC));
		assert.equal(res.response.status, 200);
	} finally {
		globalThis.fetch = origFetch;
	}
});
