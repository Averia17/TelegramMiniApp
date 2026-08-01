import test from "node:test"
import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"

test("gameplay and GLB harness use the authored full-body super animation", async () => {
  const heroView = await readFile(new URL("../src/components/BattleGame/rendering/heroes/HeroView.js", import.meta.url), "utf8")
  const harness = await readFile(new URL("./glb-hero-harness.html", import.meta.url), "utf8")
  assert.match(heroView, /fullBodySuper:\s*true/)
  assert.match(harness, /fullBodySuper:\s*true/)
  assert.match(harness, /data-skill="attack"/)
  assert.match(harness, /data-skill="super"/)
  assert.match(harness, /data-skill="gadget"/)
  assert.match(harness, /gadgetPulse/)
})
