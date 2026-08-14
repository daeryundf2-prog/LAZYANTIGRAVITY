import { existsSync, readFileSync } from "node:fs"
import test from "node:test"
import assert from "node:assert/strict"

const README = readFileSync("README.md", "utf8")

test("README shows the ULW command screenshots from committed assets", () => {
  const imagePaths = [
    "assets/readme/lazyantigravity-ulw-command.png",
    "assets/readme/lazyantigravity-ulw-running.png",
  ]

  assert.match(README, /## ULW CLI on Antigravity/)

  for (const imagePath of imagePaths) {
    assert.match(
      README,
      new RegExp(`!\\[[^\\]]+\\]\\(${imagePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`),
    )
    assert.equal(existsSync(imagePath), true, `${imagePath} must exist`)
  }
})
