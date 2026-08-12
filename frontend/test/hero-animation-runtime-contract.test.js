import test from "node:test"
import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"

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

test("runtime hero export preserves authored Actions and samples them by default", async () => {
  const exporter = await readFile(new URL("../../tools/blender/export_runtime_heroes_from_scenes.py", import.meta.url), "utf8")
  assert.match(exporter, /export_animation_mode="ACTIONS"/)
  assert.match(exporter, /export_force_sampling=\(\s*True if os\.environ\.get\("BLENDER_EXPORT_FAST"\) != "1" else False\s*\)/)
  assert.doesNotMatch(exporter, /rebind_action_slot|stash_action_for_export|GLTF_MODE/)
})

test("runtime hero export is driven only by focused scenes", async () => {
  const exporter = await readFile(new URL("../../tools/blender/export_runtime_heroes_from_scenes.py", import.meta.url), "utf8")
  assert.match(exporter, /focused_scenes/)
  assert.match(exporter, /focused_scenes\["idle"\]/)
  assert.doesNotMatch(exporter, /f"\{hero\}\.blend"/)
  assert.doesNotMatch(exporter, /[\\/]animations[\\/]/)
})
