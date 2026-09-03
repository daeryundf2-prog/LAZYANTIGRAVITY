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
