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

test("forced harness skills pulse after the controller baseline is initialized", async () => {
  const harness = await readFile(new URL("./glb-hero-harness.html", import.meta.url), "utf8")
  assert.match(harness, /let attackPulse=0\s*\n\s*let superPulse=0\s*\n\s*let gadgetPulse=0/)
  assert.match(harness, /attackPulse,\s*\n\s*superPulse,\s*\n\s*gadgetPulse/)
  assert.match(harness, /const controller[\s\S]*?if\(forcedState==="attack"\)attackPulse\+\+/)
  assert.match(harness, /const controller[\s\S]*?if\(forcedState==="super"\)superPulse\+\+/)
  assert.match(harness, /const controller[\s\S]*?if\(forcedState==="gadget"\)gadgetPulse\+\+/)
})

test("runtime hero export preserves authored Actions without NLA rebinding", async () => {
  const exporter = await readFile(new URL("../../tools/blender/export_runtime_heroes_from_scenes.py", import.meta.url), "utf8")
  assert.match(exporter, /export_animation_mode="ACTIONS"/)
  assert.match(exporter, /export_force_sampling=True/)
  assert.doesNotMatch(exporter, /rebind_action_slot|stash_action_for_export|GLTF_MODE/)
})

test("runtime hero export is driven only by focused scenes", async () => {
  const exporter = await readFile(new URL("../../tools/blender/export_runtime_heroes_from_scenes.py", import.meta.url), "utf8")
  assert.match(exporter, /focused_scenes/)
  assert.match(exporter, /focused_scenes\["idle"\]/)
  assert.doesNotMatch(exporter, /f"\{hero\}\.blend"/)
  assert.doesNotMatch(exporter, /[\\/]animations[\\/]/)
})
