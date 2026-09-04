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

/**
 * Renders verified markdown inline citations and footnotes.
 *
 * @param {object} options
 * @param {string} options.text Raw text to annotate
 * @param {object} options.grounding_metadata Grounding metadata object
 * @param {number} [options.min_confidence=0.0] Minimum confidence to include a support
 * @param {string} [options.citation_format="footnote"] 'footnote' ([^1]) or 'link' ([1](url))
 * @param {boolean} [options.high_fidelity=false] Local High-Fidelity non-parametric grounding mode (no Vertex API)
 * @param {number} [options.min_coverage=0.70] Minimum grounding coverage threshold for high-fidelity mode
 * @param {string} [options.heading="## References / Grounding Sources"] Heading for references
 */
export function renderGroundingCitations(options) {
	const rawText = typeof options?.text === "string" ? options.text : "";
	const minConfidence = typeof options?.min_confidence === "number" ? options.min_confidence : 0.0;
	const citationFormat = options?.citation_format || "footnote";
	const heading = options?.heading || "## References / Grounding Sources";
	const isHighFidelity = options?.high_fidelity === true || options?.mode === "HIGH_FIDELITY";
	const minCoverage = typeof options?.min_coverage === "number" ? options.min_coverage : 0.70;

	const { web_search_queries, grounding_chunks, grounding_supports } = parseGroundingMetadata(
		options?.grounding_metadata,
	);

	if (!rawText.trim()) {
		return {
			ok: true,
			high_fidelity_passed: true,
			abstention: false,
			rendered_text: "",
			footnotes: [],
			web_search_queries,
			total_citations: 0,
			supported_segment_count: 0,
			grounding_coverage: 0,
		};
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
		return {
			ok: true,
			high_fidelity_passed: true,
			abstention: false,
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

	// Track which chunks are actually cited and covered character ranges
	const citedChunkIndices = new Set();
	const posMap = new Map(); // pos -> Set of chunkIndices
	const coveredIntervals = [];
	let mappedSupportCount = 0;

	for (const sup of validSupports) {
		let insertPos = -1;
		let spanStart = -1;
		let spanEnd = -1;
		const [sIdx, eIdx] = resolveOffsets(rawText, sup.startIndex, sup.endIndex, sup.text);

		if (sIdx >= 0 && eIdx > sIdx && eIdx <= rawText.length) {
			insertPos = eIdx;
			spanStart = sIdx;
			spanEnd = eIdx;
		} else if (sup.text && sup.text.trim()) {
			const trimmed = sup.text.trim();
			const searchFrom = sIdx >= 0 && sIdx < rawText.length ? sIdx : 0;
			let foundIdx = rawText.indexOf(trimmed, searchFrom);
			if (foundIdx === -1 && searchFrom > 0) {
				foundIdx = rawText.indexOf(trimmed, 0);
			}
			if (foundIdx !== -1) {
				insertPos = foundIdx + trimmed.length;
				spanStart = foundIdx;
				spanEnd = foundIdx + trimmed.length;
			}
		}

		if (insertPos !== -1) {
			mappedSupportCount++;
			if (spanStart >= 0 && spanEnd > spanStart) {
				coveredIntervals.push([spanStart, spanEnd]);
			}
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
			mappedSupportCount = validSupports.length;
			insertions.push({
				pos: rawText.trimEnd().length,
				chunkIndices: Array.from(citedChunkIndices).sort((a, b) => a - b),
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

	const supportedSegmentCount = mappedSupportCount;
	const mappingRate = grounding_supports.length > 0
		? mappedSupportCount / grounding_supports.length
		: 0;

	let groundingCoverage = 0;
	if (coveredIntervals.length > 0) {
		coveredIntervals.sort((a, b) => a[0] - b[0]);
		const merged = [];
		for (const intv of coveredIntervals) {
			if (merged.length === 0) {
				merged.push([...intv]);
			} else {
				const last = merged[merged.length - 1];
				if (intv[0] <= last[1]) {
					last[1] = Math.max(last[1], intv[1]);
				} else {
					merged.push([...intv]);
				}
			}
		}

		let coveredNonWs = 0;
		for (const [start, end] of merged) {
			const slice = rawText.slice(Math.max(0, start), Math.min(rawText.length, end));
			coveredNonWs += slice.replace(/\s/g, "").length;
		}
		const totalNonWs = rawText.replace(/\s/g, "").length;
		const charCoverage = totalNonWs > 0 ? coveredNonWs / totalNonWs : 0;
		groundingCoverage = Number(Math.min(charCoverage, mappingRate > 0 ? mappingRate : 1.0).toFixed(2));
	} else if (insertions.length > 0) {
		groundingCoverage = Number(mappingRate.toFixed(2));
	}

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

// CLI runner
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
	const args = process.argv.slice(2);
	if (args.includes("--help") || args.includes("-h") || (args.length === 0 && process.stdin.isTTY)) {
		console.log(`
Usage: render_grounding_citations.mjs [options]

Options:
  --file <path>         JSON file containing { text, grounding_metadata }
  --text <string>       Raw response text
  --metadata <string>   JSON string of grounding_metadata
  --min-confidence <n>  Minimum confidence score (0.0 to 1.0)
  --format <type>       Citation format: footnote | link (default: footnote)
  --high-fidelity       Enforce local High-Fidelity non-parametric grounding mode (no Vertex API)
  --min-coverage <n>    Minimum grounding coverage threshold for high fidelity (default 0.70)
  --json                Output JSON result
`);
		process.exit(0);
	}

	let text = "";
	let metadata = null;
	let minConf = 0.0;
	let format = "footnote";
	let asJson = args.includes("--json");
	let highFidelity = args.includes("--high-fidelity");
	let minCoverage = 0.70;

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
		} else if (args[i] === "--min-coverage" && args[i + 1]) {
			minCoverage = Number(args[i + 1]) || 0.70;
			i++;
		}
	}

	if (!text && !metadata && !process.stdin.isTTY) {
		try {
			const input = fs.readFileSync(0, "utf8");
			if (input.trim()) {
				const parsed = JSON.parse(input);
				text = parsed.text || "";
				metadata = parsed.grounding_metadata || parsed.groundingMetadata || null;
			}
		} catch {}
	}

	const result = renderGroundingCitations({
		text,
		grounding_metadata: metadata,
		min_confidence: minConf,
		citation_format: format,
		high_fidelity: highFidelity,
		min_coverage: minCoverage,
	});

	if (asJson) {
		console.log(JSON.stringify(result, null, 2));
	} else {
		console.log(result.rendered_text);
	}

	if (highFidelity && !result.high_fidelity_passed) {
		process.exit(1);
	}
}
