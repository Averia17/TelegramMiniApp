import assert from "node:assert/strict"
import test from "node:test"
import {normalizeRelease} from "../src/utils/release.js"

test("release metadata accepts a semantic version tag and short commit", () => {
  assert.deepEqual(normalizeRelease({tag: "v0.0.7", commit: "abcdef123"}), {
    tag: "v0.0.7",
    commit: "abcdef123",
    deployedAt: "",
  })
})

test("release metadata rejects untrusted version strings", () => {
  const release = normalizeRelease({tag: "<script>alert(1)</script>", commit: 42})
  assert.equal(release.tag, "dev")
  assert.equal(release.commit, "")
})
