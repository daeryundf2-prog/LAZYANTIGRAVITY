#!/usr/bin/env node
/**
 * render_grounding_citations.mjs — Gemini Search Grounding Metadata Parser & Citation Renderer
 * Implements Section 4.1 of gemini_hallucination_mitigation_deep_dive.md.
 *
 * Converts response text along with Gemini API / research grounding metadata
 * (grounding_chunks, grounding_supports, web_search_queries) into verified
 * markdown with inline footnotes ([^1], [^2]) and a grounded references section.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Normalizes grounding metadata from either Gemini API (camelCase/web object)
 * or research-mcp / standard JSON (snake_case/direct url).
 */
export function parseGroundingMetadata(rawMeta) {
	if (!rawMeta || typeof rawMeta !== "object") {
		return {
			web_search_queries: [],
			grounding_chunks: [],
			grounding_supports: [],
		};
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
		return {
			index: i,
			url: String(url || "").trim(),
			title: String(title || url || `Source ${i + 1}`).trim(),
		};
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
		const startIndex =
			typeof segmentObj.startIndex === "number"
				? segmentObj.startIndex
				: typeof segmentObj.start_index === "number"
					? segmentObj.start_index
					: -1;
		const endIndex =
			typeof segmentObj.endIndex === "number"
				? segmentObj.endIndex
				: typeof segmentObj.end_index === "number"
					? segmentObj.end_index
					: -1;
		const segmentText = typeof segmentObj.text === "string" ? segmentObj.text : "";

		return {
			startIndex,
			endIndex,
			text: segmentText,
			chunkIndices: chunkIndices.map(Number).filter((n) => !Number.isNaN(n) && n >= 0),
			confidenceScores: scores.map(Number),
		};
	});

	return {
		web_search_queries: queries.map(String),
		grounding_chunks: chunks,
		grounding_supports: supports,
	};
}

/**
 * Renders verified markdown inline citations and footnotes.
 *
 * @param {object} options
 * @param {string} options.text Raw text to annotate
 * @param {object} options.grounding_metadata Grounding metadata object
 * @param {number} [options.min_confidence=0.0] Minimum confidence to include a support
 * @param {string} [options.citation_format="footnote"] 'footnote' ([^1]) or 'link' ([1](url))
 * @param {string} [options.heading="## References / Grounding Sources"] Heading for references
 */
export function renderGroundingCitations(options) {
	const rawText = typeof options?.text === "string" ? options.text : "";
	const minConfidence = typeof options?.min_confidence === "number" ? options.min_confidence : 0.0;
	const citationFormat = options?.citation_format || "footnote";
	const heading = options?.heading || "## References / Grounding Sources";

	const { web_search_queries, grounding_chunks, grounding_supports } = parseGroundingMetadata(
		options?.grounding_metadata,
	);

	if (!rawText.trim()) {
		return {
			ok: true,
			rendered_text: "",
			footnotes: [],
			web_search_queries,
			total_citations: 0,
			supported_segment_count: 0,
			grounding_coverage: 0,
		};
	}

	if (grounding_chunks.length === 0 || grounding_supports.length === 0) {
		return {
			ok: true,
			rendered_text: rawText,
			footnotes: [],
			web_search_queries,
			total_citations: 0,
			supported_segment_count: 0,
			grounding_coverage: 0,
		};
	}

	// Filter supports by min_confidence
	const validSupports = grounding_supports.filter((s) => {
		if (s.chunkIndices.length === 0) return false;
		if (minConfidence <= 0.0) return true;
		if (s.confidenceScores.length === 0) return true;
		const avg = s.confidenceScores.reduce((a, b) => a + b, 0) / s.confidenceScores.length;
		return avg >= minConfidence;
	});

	// Track which chunks are actually cited
	const citedChunkIndices = new Set();
	const insertions = []; // { pos: insertionPos, chunkIndices: [...] }

	for (const sup of validSupports) {
		let insertPos = -1;

		if (sup.startIndex >= 0 && sup.endIndex > sup.startIndex && sup.endIndex <= rawText.length) {
			insertPos = sup.endIndex;
		} else if (sup.text && sup.text.trim()) {
			// Find text occurrence
			const foundIdx = rawText.indexOf(sup.text.trim());
			if (foundIdx !== -1) {
				insertPos = foundIdx + sup.text.trim().length;
			}
		}

		if (insertPos !== -1) {
			for (const ci of sup.chunkIndices) {
				if (ci >= 0 && ci < grounding_chunks.length) {
					citedChunkIndices.add(ci);
				}
			}
			insertions.push({
				pos: insertPos,
				chunkIndices: sup.chunkIndices.filter((ci) => ci >= 0 && ci < grounding_chunks.length),
			});
		}
	}

	// If no insertions could be mapped by offsets or segment text,
	// attach all valid chunk indices at paragraph breaks or end of text.
	if (insertions.length === 0 && validSupports.length > 0) {
		for (const sup of validSupports) {
			for (const ci of sup.chunkIndices) {
				if (ci >= 0 && ci < grounding_chunks.length) {
					citedChunkIndices.add(ci);
				}
			}
		}
		if (citedChunkIndices.size > 0) {
			insertions.push({
				pos: rawText.trimEnd().length,
				chunkIndices: Array.from(citedChunkIndices),
			});
		}
	}

	// Map cited 0-based chunk indices to sequential 1-based footnote numbers
	const sortedCitedIndices = Array.from(citedChunkIndices).sort((a, b) => a - b);
	const chunkToFootnoteNum = new Map();
	const footnotes = [];

	sortedCitedIndices.forEach((chunkIdx, i) => {
		const footnoteNum = i + 1;
		chunkToFootnoteNum.set(chunkIdx, footnoteNum);
		const chunk = grounding_chunks[chunkIdx];
		footnotes.push({
			footnote_index: footnoteNum,
			chunk_index: chunkIdx,
			title: chunk.title,
			url: chunk.url,
		});
	});

	// Sort insertions by position descending so character insertions don't disrupt earlier offsets
	insertions.sort((a, b) => b.pos - a.pos);

	let rendered = rawText;
	for (const ins of insertions) {
		const footnoteNums = ins.chunkIndices
			.map((ci) => chunkToFootnoteNum.get(ci))
			.filter((fn) => fn !== undefined);

		if (footnoteNums.length === 0) continue;

		// Deduplicate and sort footnote numbers for this insertion point
		const uniqueFootnotes = Array.from(new Set(footnoteNums)).sort((a, b) => a - b);
		let tagStr = "";

		if (citationFormat === "link") {
			tagStr = uniqueFootnotes
				.map((fn) => {
					const fnInfo = footnotes.find((f) => f.footnote_index === fn);
					return ` [${fn}](${fnInfo?.url || "#"})`;
				})
				.join("");
		} else {
			// Footnote markdown style: [^1][^2]
			tagStr = uniqueFootnotes.map((fn) => `[^${fn}]`).join("");
		}

		rendered = rendered.slice(0, ins.pos) + tagStr + rendered.slice(ins.pos);
	}

	// Build footnotes section if there are citations
	if (footnotes.length > 0) {
		rendered = rendered.trimEnd() + "\n\n" + heading + "\n\n";
		if (citationFormat === "link") {
			for (const fn of footnotes) {
				rendered += `- [${fn.footnote_index}] [${fn.title}](${fn.url})\n`;
			}
		} else {
			for (const fn of footnotes) {
				rendered += `[^${fn.footnote_index}]: [${fn.title}](${fn.url})\n`;
			}
		}
	}

	const supportedSegmentCount = insertions.length;
	const groundingCoverage = Number(
		(supportedSegmentCount / Math.max(grounding_supports.length, 1)).toFixed(2),
	);

	return {
		ok: true,
		rendered_text: rendered.trimEnd() + "\n",
		footnotes,
		web_search_queries,
		total_citations: footnotes.length,
		supported_segment_count: supportedSegmentCount,
		grounding_coverage: groundingCoverage,
	};
}

// CLI runner
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
	const args = process.argv.slice(2);
	if (args.includes("--help") || args.includes("-h") || args.length === 0) {
		console.log(`
Usage: render_grounding_citations.mjs [options]

Options:
  --file <path>         JSON file containing { text, grounding_metadata }
  --text <string>       Raw response text
  --metadata <string>   JSON string of grounding_metadata
  --min-confidence <n>  Minimum confidence score (0.0 to 1.0)
  --format <type>       Citation format: footnote | link (default: footnote)
  --json                Output JSON result
`);
		process.exit(0);
	}

	let text = "";
	let metadata = null;
	let minConf = 0.0;
	let format = "footnote";
	let asJson = args.includes("--json");

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--file" && args[i + 1]) {
			const data = JSON.parse(fs.readFileSync(args[i + 1], "utf8"));
			text = data.text || "";
			metadata = data.grounding_metadata || data.groundingMetadata || null;
			i++;
		} else if (args[i] === "--text" && args[i + 1]) {
			text = args[i + 1];
			i++;
		} else if (args[i] === "--metadata" && args[i + 1]) {
			metadata = JSON.parse(args[i + 1]);
			i++;
		} else if (args[i] === "--min-confidence" && args[i + 1]) {
			minConf = Number(args[i + 1]) || 0.0;
			i++;
		} else if (args[i] === "--format" && args[i + 1]) {
			format = args[i + 1];
			i++;
		}
	}

	const result = renderGroundingCitations({
		text,
		grounding_metadata: metadata,
		min_confidence: minConf,
		citation_format: format,
	});

	if (asJson) {
		console.log(JSON.stringify(result, null, 2));
	} else {
		console.log(result.rendered_text);
	}
}
