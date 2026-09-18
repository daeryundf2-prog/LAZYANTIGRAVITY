import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";
import { spawnSync } from "node:child_process";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { canonicalPath, confinePath } from "../workspace-mcp/src/path-policy.mjs";
import { readLimitedText } from "../research-mcp/src/lib/response-limit.mjs";

const root = new URL("../", import.meta.url);
const source = (pkg) => readFileSync(new URL(`${pkg}/src/cli.mjs`, root), "utf8");
const sandbox = () => mkdtempSync(join(tmpdir(), "mcp-hardening-contract-"));
function call(pkg, name, args = {}, cwd = sandbox(), env = {}) {
	const child = spawnSync(process.execPath, [fileURLToPath(new URL(`${pkg}/dist/cli.js`, root)), "mcp"], {
		input: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
		cwd, encoding: "utf8", timeout: 10000,
		env: { ...process.env, LAZYANTIGRAVITY_OFFLINE: "1", LAZYANTIGRAVITY_WORKSPACE_ROOT: cwd, ...env },
	});
	assert.equal(child.status, 0, child.stderr);
	const rpc = JSON.parse(child.stdout);
	assert.ok(rpc.result, child.stdout);
	return JSON.parse(rpc.result.content[0].text);
}
function renderer() {
	const text = source("research-mcp");
	return runInNewContext(`${text.slice(text.indexOf("function parseGroundingMetadata"), text.indexOf("async function renderGroundingCitationsTool"))}\nrenderGroundingCitations`, { Buffer, URL });
}

test("paths: canonical existing roots, symlinks, missing output parents and explicit evidence roots", () => {
	const dir = sandbox();
	mkdirSync(join(dir, "actual"));
	try {
		symlinkSync(join(dir, "actual"), join(dir, "alias"));
	} catch {
		// Windows without symlink privilege: skip this test scenario.
		return;
	}
	assert.equal(canonicalPath(join(dir, "alias", "future", "out.txt"), true), join(canonicalPath(dir), "actual", "future", "out.txt"));
	const old = process.env.LAZYANTIGRAVITY_WORKSPACE_ROOT;
	const oldEvidence = process.env.LAZYANTIGRAVITY_ALLOWED_EVIDENCE_ROOTS;
	try {
		process.env.LAZYANTIGRAVITY_WORKSPACE_ROOT = dir;
		process.env.LAZYANTIGRAVITY_ALLOWED_EVIDENCE_ROOTS = [join(dir, "actual")].join(delimiter);
		assert.equal(confinePath("alias", { evidence: true }), join(canonicalPath(dir), "actual"));
	} finally {
		if (old === undefined) delete process.env.LAZYANTIGRAVITY_WORKSPACE_ROOT; else process.env.LAZYANTIGRAVITY_WORKSPACE_ROOT = old;
		if (oldEvidence === undefined) delete process.env.LAZYANTIGRAVITY_ALLOWED_EVIDENCE_ROOTS; else process.env.LAZYANTIGRAVITY_ALLOWED_EVIDENCE_ROOTS = oldEvidence;
	}
});

test("research: streaming byte cap cancels before buffering the whole body", async () => {
	let cancelled = false;
	const response = new Response(new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(8)); }, cancel() { cancelled = true; } }));
	await assert.rejects(readLimitedText(response, 12), /byte limit/);
	assert.equal(cancelled, true);
	assert.equal(await readLimitedText(new Response("synthetic")), "synthetic");
});

test("research: Jina and direct responses both use the bounded reader", () => {
	const text = source("research-mcp");
	assert.match(text, /readLimitedText\(jinaRes\.response\)/);
	assert.match(text, /readLimitedText\(directRes\.response\)/);
	assert.doesNotMatch(text, /await (?:res|jinaRes\.response|directRes\.response)\.(?:text|json)\(\)/);
	assert.doesNotMatch(text, /confidence_score:\s*Number\(\(1\.0/);
});

test("research: offline override rejects all network tools despite consent", () => {
	for (const [tool, args] of [["web_read", { url: "https://example.com" }], ["web_search", { query: "synthetic" }], ["fetch_json", { url: "https://example.com" }]]) {
		const result = call("research-mcp", tool, args, sandbox(), { LAZYANTIGRAVITY_RESEARCH_NETWORK: "1" });
		assert.equal(result.ok, false);
		assert.match(result.error, /OFFLINE/);
	}
});

test("citations: no fabricated fallback support, fractional indices or unmeasured confidence", () => {
	const render = renderer();
	for (const support of [
		{ grounding_chunk_indices: [0] },
		{ grounding_chunk_indices: [0.5], segment: { startIndex: 0, endIndex: 4 } },
		{ grounding_chunk_indices: [5], segment: { startIndex: 0, endIndex: 4 } },
	]) {
		const result = render({ text: "fact", high_fidelity: true, grounding_metadata: { grounding_chunks: [{ url: "https://example.com", title: "Synthetic" }], grounding_supports: [support] } });
		assert.equal(result.grounding_coverage, 0);
		assert.equal(result.total_citations, 0);
		assert.equal(result.high_fidelity_passed, false);
	}
	const result = render({ text: "fact", min_confidence: 0.5, grounding_metadata: { grounding_chunks: [{ url: "https://example.com" }], grounding_supports: [{ grounding_chunk_indices: [0], segment: { text: "fact" } }] } });
	assert.equal(result.total_citations, 0);
});

test("citations: renderer labels supplied mapping as unverified, never source verification", () => {
	const result = renderer()({ text: "fact", grounding_metadata: { grounding_chunks: [{ url: "https://example.com" }], grounding_supports: [{ grounding_chunk_indices: [0], segment: { text: "fact" } }] } });
	assert.equal(result.verification_status, "not_verified");
	assert.match(result.limitations.join(" "), /source content/i);
});

test("law: offline excerpts have provenance, unknown verification and exact article mapping", () => {
	const article = call("korean-law-mcp", "lookup_statute", { statute_name: "민법", article_number: "750" });
	assert.equal(article.grounding_status, "CACHED_EXCERPT_UNVERIFIED");
	assert.equal(article.provenance.last_verified, null);
	assert.equal(article.provenance.source_type, "bundled_excerpt");
	const absent = call("korean-law-mcp", "lookup_statute", { statute_name: "정보통신망법", article_number: "44" });
	assert.equal(absent.ok, false);
	const sub = call("korean-law-mcp", "lookup_statute", { statute_name: "정보통신망법", article_number: "44조의7" });
	assert.equal(sub.article_number, "44-7");
	const precedent = call("korean-law-mcp", "lookup_precedent", { case_number: "2017다220744" });
	assert.equal(precedent.grounding_status, "CACHED_SUMMARY_UNVERIFIED");
});

test("LSP: schemas and result metadata describe regex, not semantic capabilities", () => {
	const dir = sandbox();
	writeFileSync(join(dir, "sample.ts"), "const sample = 1;\n");
	const result = call("lsp-tools-mcp", "lsp_symbols", { filePath: "sample.ts" }, dir);
	assert.equal(result.engine, "regex");
	assert.equal(result.semanticLsp, false);
	assert.ok(result.limitations.length);
});

test("media: offline override prevents YouTube and cloud entry before binaries", () => {
	const youtube = call("media-mcp", "media_youtube", { url: "https://youtube.com" }, sandbox(), { LAZYANTIGRAVITY_MEDIA_NETWORK: "1" });
	assert.equal(youtube.ok, false);
	assert.match(youtube.error, /OFFLINE/);
	const text = source("media-mcp");
	for (const fn of ["checkExternalSttGate", "geminiDenialReason"]) {
		assert.match(text.slice(text.indexOf(`function ${fn}`), text.indexOf(`function ${fn}`) + 300), /LAZYANTIGRAVITY_OFFLINE/);
	}
});

test("media: cleanup is preview by default, confirmed-only, excludes active and retained evidence", () => {
	const dir = sandbox();
	const media = join(dir, ".lazyantigravity", "media");
	for (const name of ["job-active", "ocr-retained", "ocr-preview"]) {
		mkdirSync(join(media, name), { recursive: true });
		writeFileSync(join(media, name, "synthetic.txt"), "synthetic");
	}
	writeFileSync(join(media, "job-active", "status.json"), JSON.stringify({ status: "running" }));
	writeFileSync(join(media, "ocr-retained", ".retain"), "");
	const result = call("media-mcp", "media_cleanup", { maxMb: 0.000001 }, dir);
	assert.equal(result.dryRun, true);
	assert.equal(result.deleted.length, 0);
	assert.ok(result.protected.some((entry) => entry.dir === "job-active"));
	assert.ok(result.protected.some((entry) => entry.dir === "ocr-retained"));
	assert.equal(readFileSync(join(media, "ocr-preview", "synthetic.txt"), "utf8"), "synthetic");
	const denied = call("media-mcp", "media_cleanup", { dryRun: false }, dir);
	assert.equal(denied.ok, false);
	assert.match(denied.error, /confirm/i);
});

test("media: historical jobs are not measured, never assigned invented receipts", () => {
	const dir = sandbox();
	const job = join(dir, ".lazyantigravity", "media", "job-old");
	mkdirSync(job, { recursive: true });
	writeFileSync(join(job, "status.json"), JSON.stringify({ status: "done", input: "unknown.wav" }));
	const result = call("media-mcp", "media_transcribe_status", { jobId: "job-old" }, dir);
	assert.equal(result.processing_receipt.status, "not_measured");
	assert.equal(result.processing_receipt.exit_code, null);
	assert.equal(result.processing_receipt.started_at, null);
	assert.equal(result.processing_receipt.source.sha256, null);
});

test("media: long subprocesses use bounded asynchronous execution", () => {
	const text = source("media-mcp");
	assert.doesNotMatch(text, /function runBinary[\s\S]*?spawnSync/);
	assert.match(text, /runBoundedBinary/);
});

test("workspace: restore retains explicit environment opt-in", () => {
	assert.match(source("workspace-mcp"), /if \(process\.env\[FORK_GATE_ENV\] !== "1"\)/);
});
