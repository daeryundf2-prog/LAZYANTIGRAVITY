import { readFileSync } from "node:fs"
import test from "node:test"
import assert from "node:assert/strict"

const README = readFileSync("README.md", "utf8")

test("README explains the local PC install, update, and /ulw usage path", () => {
  const requiredSnippets = [
    "## Quick Start On This PC",
    "This repository is an Antigravity plugin root, not a standalone npm CLI package.",
    "$env:USERPROFILE\\.gemini\\config\\plugins",
    "git pull --ff-only",
    "git clone https://github.com/daeryundf2-prog/LAZYANTIGRAVITY.git lazyantigravity",
    "Restart Google Antigravity",
    "/ulw <task>",
    "/ulw resume",
  ]

  for (const snippet of requiredSnippets) {
    assert.match(README, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  }
})
