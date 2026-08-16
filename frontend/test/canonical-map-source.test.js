import test from "node:test"
import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"
import {loadCanonicalBattleMap} from "../src/components/BattleGame/canonicalMap.js"

test("canonical map loader returns the map contract used by QA", async () => {
  const payload = {
    seed: 20260810,
    spawners: [{x: 10, y: 20, width: 40, height: 40}],
    map: {id: "battle-royale@20260810", name: "battle-royale", seed: 20260810, revision: 0, width: 2400, height: 2400, tileSize: 40, walls: []},
  }
  const fetchImpl = async (url, options) => {
    assert.equal(url, "/api/battle/map-preview")
    assert.deepEqual(options, {cache: "no-store"})
    return {ok: true, json: async () => payload}
  }

  const map = await loadCanonicalBattleMap(fetchImpl)

  assert.equal(map, payload.map)
  assert.deepEqual(map.spawners, payload.spawners)
  assert.equal(map.id, "battle-royale@20260810")
})

test("canonical map loader preserves passable team features", async () => {
  const payload = {map: {id: "team-battle@20260816", name: "team-battle", walls: [], features: [{id: "team-river", type: "river"}]}}
  const fetchImpl = async (url, options) => {
    assert.equal(url, "/api/battle/map-preview?mode=team")
    assert.deepEqual(options, {cache: "no-store"})
    return {ok: true, json: async () => payload}
  }
  const map = await loadCanonicalBattleMap(fetchImpl, "team")
  assert.deepEqual(map.features, payload.map.features)
})

test("both map labs import the one canonical map loader", async () => {
  const [mapHtml, heroHtml] = await Promise.all([
    readFile(new URL("./map-environment-harness.html", import.meta.url), "utf8"),
    readFile(new URL("./glb-hero-harness.html", import.meta.url), "utf8"),
  ])

  for (const html of [mapHtml, heroHtml]) {
    assert.match(html, /import \{loadCanonicalBattleMap\} from "\/src\/components\/BattleGame\/canonicalMap\.js"/)
    assert.doesNotMatch(html, /fetch\("\/api\/battle\/map-preview"/)
  }
  assert.match(mapHtml, /await loadCanonicalBattleMap\(fetch, selectedMode\)/)
  assert.match(heroHtml, /await loadCanonicalBattleMap\(\)/)
  assert.doesNotMatch(heroHtml, /islandName:null/)
  assert.match(heroHtml, /islandName:"Остров Первого Испытания"/)
})
