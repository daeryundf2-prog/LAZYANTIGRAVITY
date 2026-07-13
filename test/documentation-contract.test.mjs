import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const docs = ["README.md", "src/README.md", "src/README.ko.md", "CHANGELOG.md",
	"docs/experimental-skills.md", "docs/experimental-skills.ko.md", "docs/scorecard.md"];
const contents = Object.fromEntries(docs.map((path) => [path, readFileSync(join(root, path), "utf8")]));

test("user documentation states only the verified active surface", () => {
	// Given: every user-facing Markdown document.
	const text = Object.values(contents).join("\n");
	// When: the verified inventory is searched.
	// Then: exact supported counts and residual limitations are explicit.
	assert.match(contents["README.md"], /15 active skills/);
	assert.match(contents["README.md"], /19 experimental skills.*unsupported/s);
	assert.match(contents["README.md"], /2 official hooks/);
	assert.match(contents["README.md"], /3 local MCP servers/);
	assert.match(text, /Node\.js >=20\.17/);
	assert.match(text, /four staged layouts.*rule parity remains unverified/is);
	assert.match(text, /real SQLite.*unavailable/is);
});

test("documentation rejects retired or absolute reliability claims", () => {
	// Given: the generated user documentation.
	const text = Object.values(contents).join("\n");
	// When: prohibited claims are scanned.
	const prohibited = [
		/all models supported/i, /model routing/i, /remote MCP/i, /telemetry/i, /auto[- ]?update/i,
		/zero[- ]configuration/i, /100% reliable/i, /eliminates? hallucinations/i,
		/query (?:Postgres|MySQL)/i, /near[- ]?0%/i,
	];
	// Then: no retired, unsupported, or absolute claim appears.
	for (const pattern of prohibited) assert.doesNotMatch(text, pattern);
});

test("all local Markdown links resolve and all docs are UTF-8", () => {
	// Given: each user-facing Markdown file.
	for (const [path, text] of Object.entries(contents)) {
		// When: relative Markdown links are extracted.
		const links = [...text.matchAll(/\[[^\]]+\]\((?!https?:|#)([^)]+)\)/g)].map((match) => match[1]);
		// Then: every target exists and no replacement character signals decoding loss.
		assert.doesNotMatch(text, /\uFFFD/, path);
		for (const target of links) assert.doesNotThrow(() => readFileSync(join(dirname(join(root, path)), target)), `${path}: ${target}`);
	}
});
