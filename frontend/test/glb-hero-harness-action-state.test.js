import test from "node:test"
import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"

test("GLB hero harness action buttons do not remain visually active after a one-shot action", async () => {
  const harness = await readFile(new URL("./glb-hero-harness.html", import.meta.url), "utf8")
  assert.doesNotMatch(harness, /button\.classList\.add\("active"\)/)
})
