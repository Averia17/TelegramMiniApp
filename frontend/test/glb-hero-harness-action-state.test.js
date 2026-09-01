import test from "node:test"
import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"

test("GLB hero harness action buttons do not remain visually active after a one-shot action", async () => {
  const harness = await readFile(new URL("./glb-hero-harness.html", import.meta.url), "utf8")
  assert.doesNotMatch(harness, /button\.classList\.add\("active"\)/)
})

test("GLB hero harness routes preview-only animation buttons to the controller", async () => {
  const harness = await readFile(new URL("./glb-hero-harness.html", import.meta.url), "utf8")
  assert.match(harness, /animation\s*===\s*"spawn"[\s\S]*?controller\.playSpawn\(\)/)
  assert.match(harness, /data-animation="stunned"[\s\S]*?animation\s*===\s*"stunned"[\s\S]*?controller\.playSafe\("stunned"/)
  assert.match(harness, /player\.channel\s*=\s*animation\s*===\s*"aimSuper"\s*\?\s*1\s*:\s*0/)
  assert.match(harness, /animation\s*===\s*"aimGadget"[\s\S]*?controller\.playSafe\("aimGadget"/)
  assert.match(harness, /view\.setResult\(null\)/)
})
