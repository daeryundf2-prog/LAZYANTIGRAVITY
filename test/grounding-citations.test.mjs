import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	renderGroundingCitations,
	parseGroundingMetadata,
} from "../scripts/render_grounding_citations.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SCRIPT = join(ROOT, "scripts", "render_grounding_citations.mjs");

test("parseGroundingMetadata handles camelCase (Gemini API) and snake_case formats", () => {
	const geminiMeta = {
		webSearchQueries: ["query 1"],
		groundingChunks: [
			{ web: { uri: "https://example.com/1", title: "Example One" } },
		],
		groundingSupports: [
			{
				segment: { startIndex: 0, endIndex: 10, text: "Sample text" },
				groundingChunkIndices: [0],
				confidenceScores: [0.92],
			},
		],
	};

	const parsed = parseGroundingMetadata(geminiMeta);
	assert.equal(parsed.web_search_queries.length, 1);
	assert.equal(parsed.grounding_chunks[0].url, "https://example.com/1");
	assert.equal(parsed.grounding_chunks[0].title, "Example One");
	assert.equal(parsed.grounding_supports[0].startIndex, 0);
	assert.equal(parsed.grounding_supports[0].endIndex, 10);
	assert.deepEqual(parsed.grounding_supports[0].chunkIndices, [0]);
	assert.deepEqual(parsed.grounding_supports[0].confidenceScores, [0.92]);
});

test("renderGroundingCitations renders inline footnotes and bibliography", () => {
	const text = "Alpha is first. Beta is second.";
	const metadata = {
		grounding_chunks: [
			{ url: "https://alpha.org", title: "Alpha Spec" },
			{ url: "https://beta.org", title: "Beta Spec" },
		],
		grounding_supports: [
			{
				segment: { startIndex: 0, endIndex: 15, text: "Alpha is first." },
				grounding_chunk_indices: [0],
				confidence_scores: [0.98],
			},
			{
				segment: { startIndex: 16, endIndex: 31, text: "Beta is second." },
				grounding_chunk_indices: [1],
				confidence_scores: [0.94],
			},
		],
	};

	const result = renderGroundingCitations({ text, grounding_metadata: metadata });
	assert.equal(result.ok, true);
	assert.equal(result.total_citations, 2);
	assert.equal(result.supported_segment_count, 2);
	assert.match(result.rendered_text, /Alpha is first\.\[\^1\] Beta is second\.\[\^2\]/);
	assert.match(result.rendered_text, /\[\^1\]: \[Alpha Spec\]\(https:\/\/alpha\.org\)/);
	assert.match(result.rendered_text, /\[\^2\]: \[Beta Spec\]\(https:\/\/beta\.org\)/);
});

test("renderGroundingCitations filters out supports below min_confidence", () => {
	const text = "Fact with high confidence. Fact with low confidence.";
	const metadata = {
		grounding_chunks: [
			{ url: "https://trusted.org", title: "Trusted Source" },
			{ url: "https://rumor.org", title: "Rumor Source" },
		],
		grounding_supports: [
			{
				segment: { startIndex: 0, endIndex: 26, text: "Fact with high confidence." },
				grounding_chunk_indices: [0],
				confidence_scores: [0.9],
			},
			{
				segment: { startIndex: 27, endIndex: 52, text: "Fact with low confidence." },
				grounding_chunk_indices: [1],
				confidence_scores: [0.4],
			},
		],
	};

	const result = renderGroundingCitations({
		text,
		grounding_metadata: metadata,
		min_confidence: 0.8,
	});

	assert.equal(result.ok, true);
	assert.equal(result.total_citations, 1);
	assert.match(result.rendered_text, /Fact with high confidence\.\[\^1\]/);
	assert.doesNotMatch(result.rendered_text, /\[\^2\]/);
	assert.doesNotMatch(result.rendered_text, /Rumor Source/);
});

test("renderGroundingCitations CLI runs and outputs markdown footnotes", () => {
	const text = "Safe fact test.";
	const meta = JSON.stringify({
		grounding_chunks: [{ url: "https://test.local", title: "Local Test" }],
		grounding_supports: [
			{
				segment: { startIndex: 0, endIndex: text.length, text },
				grounding_chunk_indices: [0],
			},
		],
	});

	const res = spawnSync(process.execPath, [SCRIPT, "--text", text, "--metadata", meta, "--json"], {
		encoding: "utf8",
	});

	assert.equal(res.status, 0);
	const data = JSON.parse(res.stdout);
	assert.equal(data.ok, true);
	assert.equal(data.total_citations, 1);
	assert.match(data.rendered_text, /\[\^1\]/);
});

test("renderGroundingCitations converts Protobuf UTF-8 byte offsets for CJK text", () => {
	// "인공지능 모델" is 7 chars, but 19 UTF-8 bytes:
	// "인공지능" (12 bytes) + " " (1 byte) + "모델" (6 bytes) = 19 bytes.
	const text = "인공지능 모델이 생성한 텍스트입니다.";
	const firstSentenceBytes = Buffer.byteLength("인공지능 모델", "utf8"); // 19

	const metadata = {
		grounding_chunks: [
			{ url: "https://ai.example.com", title: "AI Model Paper" },
		],
		grounding_supports: [
			{
				segment: { startIndex: 0, endIndex: firstSentenceBytes, text: "인공지능 모델" }, // byte offset 19, char index 7
				grounding_chunk_indices: [0],
			},
		],
	};

	const result = renderGroundingCitations({ text, grounding_metadata: metadata });
	assert.equal(result.ok, true);
	assert.equal(result.total_citations, 1);
	assert.match(result.rendered_text, /^인공지능 모델\[\^1\]이 생성한 텍스트입니다\./);
});

test("renderGroundingCitations coalesces multiple supports at identical positions without duplicates", () => {
	const text = "Grounded fact statement.";
	const metadata = {
		grounding_chunks: [
			{ url: "https://source1.org", title: "Source 1" },
			{ url: "https://source2.org", title: "Source 2" },
		],
		grounding_supports: [
			{
				segment: { startIndex: 0, endIndex: text.length },
				grounding_chunk_indices: [0],
			},
			{
				segment: { startIndex: 0, endIndex: text.length },
				grounding_chunk_indices: [1, 0], // includes chunk 0 again
			},
		],
	};

	const result = renderGroundingCitations({ text, grounding_metadata: metadata });
	assert.equal(result.ok, true);
	assert.equal(result.total_citations, 2);
	// Footnotes should be coalesced: [^1][^2], not [^1][^1][^2]
	assert.match(result.rendered_text, /Grounded fact statement\.\[\^1\]\[\^2\]/);
	assert.doesNotMatch(result.rendered_text, /\[\^1\]\[\^1\]/);
});

test("renderGroundingCitations protects surrogate pair emoji boundaries", () => {
	// "Alert: 🚨 Incident reported."
	// 🚨 is \uD83D\uDEA8 (surrogate pair, 2 chars)
	const text = "Alert: 🚨 Incident reported.";
	const alertIndex = text.indexOf("🚨"); // 7
	// If an offset improperly lands at alertIndex + 1 (bisecting the surrogate pair):
	const metadata = {
		grounding_chunks: [
			{ url: "https://security.example.com", title: "Sec Notice" },
		],
		grounding_supports: [
			{
				segment: { startIndex: 0, endIndex: alertIndex + 1 }, // Bisects surrogate!
				grounding_chunk_indices: [0],
			},
		],
	};

	const result = renderGroundingCitations({ text, grounding_metadata: metadata });
	assert.equal(result.ok, true);
	// Should adjust past the full emoji, keeping the emoji intact
	assert.match(result.rendered_text, /Alert: 🚨\[\^1\] Incident reported\./);
});

test("renderGroundingCitations enforces High-Fidelity mode and passes when coverage is high (Section 4.2)", () => {
	const text = "Fact one is well grounded. Fact two is also well grounded.";
	const metadata = {
		grounding_chunks: [
			{ url: "https://source1.org", title: "Source 1" },
			{ url: "https://source2.org", title: "Source 2" },
		],
		grounding_supports: [
			{
				segment: { startIndex: 0, endIndex: 26, text: "Fact one is well grounded." },
				grounding_chunk_indices: [0],
				confidence_scores: [0.95],
			},
			{
				segment: { startIndex: 27, endIndex: 58, text: "Fact two is also well grounded." },
				grounding_chunk_indices: [1],
				confidence_scores: [0.92],
			},
		],
	};

	const result = renderGroundingCitations({
		text,
		grounding_metadata: metadata,
		high_fidelity: true,
		min_coverage: 0.70,
	});

	assert.equal(result.ok, true);
	assert.equal(result.high_fidelity_passed, true);
	assert.equal(result.abstention, false);
	assert.equal(result.grounding_coverage, 1.0);
	assert.match(result.rendered_text, /\[\^1\]/);
	assert.match(result.rendered_text, /\[\^2\]/);
});

test("renderGroundingCitations enforces High-Fidelity mode and abstains when coverage is below threshold (Section 4.2)", () => {
	const text = "Fact with no source. Fabricated hallucination claim.";
	const metadata = {
		grounding_chunks: [],
		grounding_supports: [],
	};

	const result = renderGroundingCitations({
		text,
		grounding_metadata: metadata,
		high_fidelity: true,
		min_coverage: 0.70,
	});

	assert.equal(result.ok, false);
	assert.equal(result.high_fidelity_passed, false);
	assert.equal(result.abstention, true);
	assert.match(result.rendered_text, /\[INSUFFICIENT_DATA\]/);
});

test("renderGroundingCitations CLI with --high-fidelity exits 1 when coverage fails", () => {
	const text = "Unbacked claim.";
	const meta = JSON.stringify({
		grounding_chunks: [],
		grounding_supports: [],
	});

	const res = spawnSync(process.execPath, [SCRIPT, "--text", text, "--metadata", meta, "--high-fidelity", "--json"], {
		encoding: "utf8",
	});

	assert.equal(res.status, 1);
	const data = JSON.parse(res.stdout);
	assert.equal(data.ok, false);
	assert.equal(data.abstention, true);
});

