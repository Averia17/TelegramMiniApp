import test from "node:test"
import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"

const read = name => readFile(new URL(`../public/test/${name}`, import.meta.url), "utf8")

test("test hub links to the hero harness and map environment lab", async () => {
  const html = await read("index.html")

  assert.match(html, /glb-hero-harness\.html\?hero=Kaze/)
  assert.match(html, /map-environment-harness\.html/)
  assert.match(html, /id="map-preview"/)
})

test("map environment lab uses the shared MapRenderer and inspection map", async () => {
  const html = await read("../../test/map-environment-harness.html")

  assert.match(html, /from "\/src\/components\/BattleGame\/rendering\/map\/MapRenderer\.js"/)
  assert.doesNotMatch(html, /battle-royale-inspection-map/)
  assert.match(html, /fetch\("\/api\/battle\/map-preview\?seed=20260810"\)/)
  assert.match(html, /new MapRenderer\(mapRoot, \{lowQuality: true\}\)/)
  assert.doesNotMatch(html, /instantiateEnvironment\(visual\)/)
  assert.doesNotMatch(html, /sampleVisuals/)
  assert.doesNotMatch(html, /loadEnvironmentSamples/)
  assert.match(html, /const BATTLE_CAMERA_ANGLE = THREE\.MathUtils\.degToRad\(55\)/)
  assert.match(html, /target\.x,\s*target\.y \+ distance \* Math\.sin\(BATTLE_CAMERA_ANGLE\)/)
  assert.match(html, /target\.z \+ distance \* Math\.cos\(BATTLE_CAMERA_ANGLE\)/)
  assert.match(html, /render_game_to_text/)
})
