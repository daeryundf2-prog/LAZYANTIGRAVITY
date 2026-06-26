import { readFileSync } from "node:fs"
import test from "node:test"
import assert from "node:assert/strict"

const README = readFileSync("README.md", "utf8")

test("README explains the local PC install, update, and /ulw usage path", () => {
  const requiredSnippets = [
    "## ⚡ Quick Start",
    "$env:USERPROFILE\\.gemini\\config\\plugins",
    "git clone https://github.com/daeryundf2-prog/LAZYANTIGRAVITY.git lazyantigravity",
    "restart your Antigravity agent session",
    "$browse",
    "ultrawork",
    "ulw",
  ]

  for (const snippet of requiredSnippets) {
    assert.match(README, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  }
})
