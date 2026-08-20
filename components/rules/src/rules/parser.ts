import { RuleFrontmatterParseError } from "./errors.js";
import { findClosingBracket, parseStringValue, splitCommaSeparated, stripComment } from "./parser-utils.js";
import type { ParsedRule, RuleFrontmatter } from "./types.js";

const FRONTMATTER_OPENING = "---\n";
const FRONTMATTER_OPENING_CRLF = "---\r\n";

/** Parse markdown rule content and extract the supported YAML frontmatter subset. */
export function parseRule(content: string): ParsedRule {
	const normalizedContent = stripBom(content);
	const openingLength = getOpeningDelimiterLength(normalizedContent);
	if (openingLength === 0) {
		return { frontmatter: {}, body: normalizedContent };
	}

	const closingDelimiter = findClosingDelimiter(normalizedContent, openingLength);
	if (closingDelimiter === null) {
		return {
			frontmatter: {},
			body: normalizedContent,
			diagnostic: "Missing closing frontmatter delimiter",
		};
	}

	const yamlContent = normalizedContent.slice(openingLength, closingDelimiter.start);
	const body = normalizedContent.slice(closingDelimiter.bodyStart);

	try {
		return { frontmatter: parseYamlFrontmatter(yamlContent), body };
	} catch (error) {
		const message = error instanceof Error ? error.message : "Invalid YAML frontmatter";
		return {
			frontmatter: {},
			body: normalizedContent,
			diagnostic: `Malformed frontmatter: ${message}`,
		};
	}
}

function stripBom(content: string): string {
	return content.startsWith("\uFEFF") ? content.slice(1) : content;
}

function getOpeningDelimiterLength(content: string): number {
	if (content.startsWith(FRONTMATTER_OPENING_CRLF)) return FRONTMATTER_OPENING_CRLF.length;
	if (content.startsWith(FRONTMATTER_OPENING)) return FRONTMATTER_OPENING.length;
	return 0;
}

function findClosingDelimiter(content: string, openingLength: number): { start: number; bodyStart: number } | null {
	let lineStart = openingLength;

	while (lineStart <= content.length) {
		const nextNewline = content.indexOf("\n", lineStart);
		const lineEnd = nextNewline === -1 ? content.length : nextNewline;
		const line = content.slice(lineStart, lineEnd).replace(/\r$/, "");

		if (line === "---") {
			return {
				start: lineStart,
				bodyStart: nextNewline === -1 ? content.length : nextNewline + 1,
			};
		}

		if (nextNewline === -1) break;
		lineStart = nextNewline + 1;
	}

	return null;
}

function parseYamlFrontmatter(yamlContent: string): RuleFrontmatter {
	const lines = yamlContent.replace(/\r\n/g, "\n").split("\n");
	const frontmatter: RuleFrontmatter = {};
	const globValues: string[] = [];
	const seenGlobs = new Set<string>();
	let lineIndex = 0;

	while (lineIndex < lines.length) {
		const rawLine = lines[lineIndex];
		if (rawLine === undefined) break;

		const line = stripComment(rawLine).trim();
		if (line.length === 0) {
			lineIndex += 1;
			continue;
		}

		const colonIndex = line.indexOf(":");
		if (colonIndex === -1) {
			throw new RuleFrontmatterParseError(`Expected key-value pair on line ${lineIndex + 1}`);
		}

		const key = line.slice(0, colonIndex).trim();
		const rawValue = line.slice(colonIndex + 1).trim();

		if (key === "description") {
			frontmatter.description = parseStringValue(rawValue);
			lineIndex += 1;
			continue;
		}

		if (key === "alwaysApply") {
			frontmatter.alwaysApply = parseBooleanValue(rawValue, lineIndex + 1);
			lineIndex += 1;
			continue;
		}

		if (key === "globs" || key === "paths" || key === "applyTo") {
			const parsed = parseGlobValue(rawValue, lines, lineIndex);
			for (const glob of parsed.values) {
				if (!seenGlobs.has(glob)) {
					seenGlobs.add(glob);
					globValues.push(glob);
				}
			}
			lineIndex += parsed.consumed;
			continue;
		}

		lineIndex += 1;
	}

	const singleGlob = globValues[0];
	if (globValues.length === 1 && singleGlob !== undefined) {
		frontmatter.globs = singleGlob;
	} else if (globValues.length > 1) {
		frontmatter.globs = globValues;
	}

	return frontmatter;
}

function parseBooleanValue(value: string, lineNumber: number): boolean {
	if (value === "true") return true;
	if (value === "false") return false;
	throw new RuleFrontmatterParseError(`Expected boolean on line ${lineNumber}`);
}

function parseGlobValue(rawValue: string, lines: string[], lineIndex: number): { values: string[]; consumed: number } {
	if (rawValue.startsWith("[")) {
		return { values: parseInlineArray(rawValue), consumed: 1 };
	}

	if (rawValue.length === 0) {
		return parseMultilineArray(lines, lineIndex);
	}

	const value = parseStringValue(rawValue);
	if (value.includes(",")) {
		return {
			values: value
				.split(",")
				.map((item) => item.trim())
				.filter(Boolean),
			consumed: 1,
		};
	}

	return { values: [value], consumed: 1 };
}

function parseMultilineArray(lines: string[], lineIndex: number): { values: string[]; consumed: number } {
	const values: string[] = [];
	let consumed = 1;

	for (let index = lineIndex + 1; index < lines.length; index += 1) {
		const rawLine = lines[index];
		if (rawLine === undefined) break;

		const lineWithoutComment = stripComment(rawLine);
		if (lineWithoutComment.trim().length === 0) {
			consumed += 1;
			continue;
		}

		const arrayItem = lineWithoutComment.match(/^\s+-\s*(.*)$/);
		if (arrayItem === null) break;

		values.push(parseStringValue(arrayItem[1] ?? ""));
		consumed += 1;
	}

	return { values: values.filter(Boolean), consumed };
}

function parseInlineArray(value: string): string[] {
	const closingBracketIndex = findClosingBracket(value);
	if (closingBracketIndex === -1) {
		throw new RuleFrontmatterParseError("Unclosed inline array");
	}

	const trailing = value.slice(closingBracketIndex + 1).trim();
	if (trailing.length > 0) {
		throw new RuleFrontmatterParseError("Unexpected content after inline array");
	}

	const content = value.slice(1, closingBracketIndex).trim();
	if (content.length === 0) return [];

	return splitCommaSeparated(content).map(parseStringValue).filter(Boolean);
}
