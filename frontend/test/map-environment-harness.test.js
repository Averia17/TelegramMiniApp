import test from "node:test"
import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"

const read = name => readFile(new URL(`../public/test/${name}`, import.meta.url), "utf8")

test("map environment lab uses the complete battle renderer and canonical map", async () => {
  const html = await read("../../test/map-environment-harness.html")

  assert.match(html, /from "\/src\/components\/BattleGame\/rendering\/three\/ThreeBattleRenderer\.js"/)
  assert.match(html, /fetch\("\/api\/battle\/map-preview"/)
  assert.match(html, /new ThreeBattleRenderer\(canvas\)/)
  assert.match(html, /battleRenderer\.setState\(battleState\)/)
  assert.doesNotMatch(html, /new THREE\.Scene|new OrbitControls|new MapRenderer/)
  assert.doesNotMatch(html, /lowQuality|LowQuality|low-quality/)
  assert.match(html, /data-zone="center"/)
  assert.match(html, /data-zone="north"/)
  assert.match(html, /id="toggle-panel"/)
  assert.match(html, /from "\/src\/components\/BattleGame\/NetworkSimulation\.js"/)
  assert.match(html, /movePosition\(/)
  assert.match(html, /render_game_to_text/)
})

test("map lab exposes the canonical battle view controls", async () => {
  const html = await read("../../test/map-environment-harness.html")

  assert.match(html, /id="toggle-panel"/)
  assert.match(html, /data-zone="center"/)
  assert.match(html, /const updatePosition = \(x, y, activeZone = null\)/)
})
