import test from "node:test"
import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"

const read = name => readFile(new URL(`../public/test/${name}`, import.meta.url), "utf8")

test("map environment lab uses the complete battle renderer and canonical map", async () => {
  const html = await read("../../test/map-environment-harness.html")

  assert.match(html, /from "\/src\/components\/BattleGame\/rendering\/three\/ThreeBattleRenderer\.js"/)
  assert.match(html, /loadCanonicalBattleMap/)
	assert.match(html, /data-map-mode="team"/)
  assert.match(html, /loadCanonicalBattleMap\(fetch, selectedMode\)/)
	assert.match(html, /objectives: \(map\.objectives \|\| \[\]\)\.map/)
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
  assert.match(html, /canvas\.addEventListener\("pointerdown"/)
  assert.match(html, /canvas\.addEventListener\("pointermove"/)
  assert.match(html, /battleRenderer\.cameraRig\.panByScreen\(/)
})

test("map and hero labs expose wheel zoom controls", async () => {
  const [mapHtml, heroHtml] = await Promise.all([
    read("../../test/map-environment-harness.html"),
    read("../../test/glb-hero-harness.html"),
  ])

  for (const html of [mapHtml, heroHtml]) {
    assert.match(html, /addEventListener\("wheel"/)
    assert.match(html, /event\.preventDefault\(\)/)
    assert.match(html, /event\.deltaY/)
  }
})
