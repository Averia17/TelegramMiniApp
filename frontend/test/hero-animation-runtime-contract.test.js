import test from "node:test"
import assert from "node:assert/strict"
import {readFile as readFileUncached} from "node:fs/promises"

const readFileCache = new Map()
const readFile = (file, encoding) => {
  const key = `${String(file)}:${encoding}`
  if (!readFileCache.has(key)) readFileCache.set(key, readFileUncached(file, encoding))
  return readFileCache.get(key)
}

test("gameplay and GLB harness use the authored full-body super animation", async () => {
  const heroView = await readFile(new URL("../src/components/BattleGame/rendering/heroes/HeroView.js", import.meta.url), "utf8")
  const harness = await readFile(new URL("./glb-hero-harness.html", import.meta.url), "utf8")
  assert.match(heroView, /fullBodySuper:\s*true/)
  assert.match(harness, /ThreeBattleRenderer/)
  assert.match(harness, /data-skill="attack"/)
  assert.match(harness, /data-skill="super"/)
  assert.match(harness, /data-skill="gadget"/)
  assert.match(harness, /gadgetPulse/)
})

test("forced harness skills pulse after the controller baseline is initialized", async () => {
  const harness = await readFile(new URL("./glb-hero-harness.html", import.meta.url), "utf8")
  assert.match(harness, /player\.attackPulse\+\+/)
  assert.match(harness, /player\.superPulse\+\+/)
  assert.match(harness, /player\.gadgetPulse\+\+/)
})

test("GLB hero harness starts away from the center beacon and closer by default", async () => {
  const harness = await readFile(new URL("./glb-hero-harness.html", import.meta.url), "utf8")
  assert.match(harness, /x:map\.width\*\.5,y:map\.height\*\.75/)
  assert.match(harness, /rotation:Math\.PI\/2/)
  assert.match(harness, /let zoom=1\.6/)
  assert.match(harness, /resize\(\);applyZoom\(\)/)
})

test("network respawn snaps the hero to its authoritative base position", async () => {
  const heroView = await readFile(new URL("../src/components/BattleGame/rendering/heroes/HeroView.js", import.meta.url), "utf8")
  assert.match(heroView, /if \(this\.lastLives <= 0 && state\.lives > 0\) \{[\s\S]*?this\.x = state\.x[\s\S]*?this\.y = state\.y/)
})

test("runtime hero export preserves authored Actions and samples them by default", async () => {
  const exporter = await readFile(new URL("../../tools/blender/export_runtime_heroes_from_master_blends.py", import.meta.url), "utf8")
  assert.match(exporter, /export_animation_mode="ACTIONS"/)
  assert.match(exporter, /export_force_sampling=not BLENDER_EXPORT_FAST/)
  assert.doesNotMatch(exporter, /rebind_action_slot|stash_action_for_export|GLTF_MODE/)
})

test("runtime hero export is driven only by master blends", async () => {
  const exporter = await readFile(new URL("../../tools/blender/export_runtime_heroes_from_master_blends.py", import.meta.url), "utf8")
  assert.match(exporter, /f"\{hero\}\.blend"/)
  assert.doesNotMatch(exporter, /focused_scenes|scenes[\\/]/)
  assert.doesNotMatch(exporter, /[\\/]animations[\\/]/)
})
