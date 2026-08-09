import assert from "node:assert/strict";
import test from "node:test";
import { computeLineHash, formatHashlineText, validateLineHash } from "../components/hashline/index.mjs";

test("[hashline.computeHash] produces deterministic 2-char hash for line content", () => {
  const hash1 = computeLineHash("function hello() {");
  const hash2 = computeLineHash("function hello() {");
  const hash3 = computeLineHash("return 'world';");

  assert.equal(typeof hash1, "string");
  assert.equal(hash1.length, 2);
  assert.equal(hash1, hash2);
  assert.notEqual(hash1, hash3);
});

test("[hashline.formatText] formats text with LINE#HASH| content", () => {
  const sample = "const a = 10;\nconst b = 20;\nreturn a + b;";
  const formatted = formatHashlineText(sample);
  const lines = formatted.split("\n");

  assert.equal(lines.length, 3);
  assert.match(lines[0], /^1#[A-Z0-9]{2}\| const a = 10;$/);
  assert.match(lines[1], /^2#[A-Z0-9]{2}\| const b = 20;$/);
  assert.match(lines[2], /^3#[A-Z0-9]{2}\| return a \+ b;$/);
});

test("[hashline.validateLineHash] validates correct hashes and detects stale edits", () => {
  const sample = "const x = 1;\nconst y = 2;\nreturn x + y;";
  const hashLine1 = computeLineHash("const x = 1;");

  const validResult = validateLineHash(sample, 1, hashLine1);
  assert.equal(validResult.valid, true);
  assert.equal(validResult.actualHash, hashLine1);
  assert.equal(validResult.lineContent, "const x = 1;");

  const invalidResult = validateLineHash(sample, 1, "ZZ");
  assert.equal(invalidResult.valid, false);

  const staleResult = validateLineHash("const x = 99;\nconst y = 2;\nreturn x + y;", 1, hashLine1);
  assert.equal(staleResult.valid, false);
});
