import { existsSync, readFileSync } from "node:fs"
import test from "node:test"
import assert from "node:assert/strict"

const README = readFileSync("README.md", "utf8")

test("README shows the ULW command screenshots from committed assets", () => {
  const imagePaths = [
    "assets/readme/lazyantigravity-ulw-command.png",
    "assets/readme/lazyantigravity-ulw-running.png",
  ]

  assert.match(README, /## ⚙️ ULW-Loop: Evidence-Audited Orchestration/)

  for (const imagePath of imagePaths) {
    const escapedPath = imagePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const mdRegex = new RegExp(`!\\[[^\\]]+\\]\\(${escapedPath}\\)`);
    const htmlRegex = new RegExp(`<img[^>]+src=["']${escapedPath}["']`);
    assert.ok(
      mdRegex.test(README) || htmlRegex.test(README),
      `README must contain image: ${imagePath}`
    )
    assert.equal(existsSync(imagePath), true, `${imagePath} must exist`)
  }
})
