import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))
const packageJsonPath = join(root, "package.json")
const packageLockPath = join(root, "package-lock.json")
const publishWorkflowPath = join(root, ".github", "workflows", "npm-publish.yml")
const binPath = join(root, "bin", "lazyantigravity.js")
const releaseVersion = "0.4.0"

describe("lazyantigravity npm package", () => {
  it("maps the package name and bin to lazyantigravity", () => {
    // given
    assert.equal(existsSync(packageJsonPath), true, "root package.json must exist")

    // when
    const manifest = JSON.parse(readFileSync(packageJsonPath, "utf8"))

    // then
    assert.equal(manifest.name, "lazyantigravity")
    assert.equal(manifest.version, releaseVersion)
    assert.equal(manifest.bin?.["lazyantigravity"], "bin/lazyantigravity.js")
    assert.equal(manifest.private, undefined)
  })

  it("keeps publish metadata aligned with the release version", () => {
    // given
    assert.equal(existsSync(packageJsonPath), true, "root package.json must exist")
    assert.equal(existsSync(packageLockPath), true, "package-lock.json must exist")
    assert.equal(existsSync(publishWorkflowPath), true, "npm publish workflow must exist")

    // when
    const manifest = JSON.parse(readFileSync(packageJsonPath, "utf8"))
    const lockfile = JSON.parse(readFileSync(packageLockPath, "utf8"))
    const publishWorkflow = readFileSync(publishWorkflowPath, "utf8")

    // then
    assert.equal(manifest.version, releaseVersion)
    assert.equal(lockfile.version, releaseVersion)
    assert.equal(lockfile.packages?.[""]?.version, releaseVersion)
    assert.match(publishWorkflow, /default: "0.2.2"/)
  })

  it("prints usage when run with no arguments", () => {
    // given
    assert.equal(existsSync(binPath), true, "lazyantigravity bin must exist")

    // when
    const result = spawnSync(process.execPath, [binPath], {
      cwd: root,
      encoding: "utf8",
    })

    // then
    assert.equal(result.status, 1)
    assert.match(result.stdout, /Usage: lazyantigravity install/)
  })
})
