import { execFileSync } from "node:child_process"
import { readFileSync, statSync } from "node:fs"
import test from "node:test"
import assert from "node:assert/strict"

const HANGUL_PATTERN = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/u
const IGNORED_PREFIXES = [".omo/", "plugins/omo/", "README.md"]

function trackedFiles() {
  return execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split("\n")
    .filter((file) => file.length > 0)
    .filter((file) => !IGNORED_PREFIXES.some((prefix) => file.startsWith(prefix)))
}

function isBinary(buffer) {
  return buffer.includes(0)
}

test("tracked text files do not contain Hangul", () => {
  const offenders = []

  for (const file of trackedFiles()) {
    const stat = statSync(file, { throwIfNoEntry: false })
    if (!stat?.isFile()) continue

    const buffer = readFileSync(file)
    if (isBinary(buffer)) continue

    const text = buffer.toString("utf8")
    if (!HANGUL_PATTERN.test(text)) continue

    offenders.push(file)
  }

  assert.deepEqual(offenders, [], `tracked text files with Hangul: ${offenders.join(", ")}`)
})
