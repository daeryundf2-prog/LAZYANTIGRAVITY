import { readFileSync } from "node:fs"
import test from "node:test"
import assert from "node:assert/strict"

const README = readFileSync("README.md", "utf8")
const HANGUL_PATTERN = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/u

test("README documents built-in LazyAntigravity workflows", () => {
  const requiredSnippets = [
    "LazyAntigravity",
    "Install",
    "/ulw",
    "/init-deep",
    "Yeongyu Kim",
    "yohak2",
    "License",
    "MIT",
  ]

  for (const snippet of requiredSnippets) {
    assert.match(README, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  }
})
