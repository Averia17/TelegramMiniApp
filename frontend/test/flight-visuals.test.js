import test from "node:test"
import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"
import * as THREE from "three"
import {createProp} from "../src/components/BattleGame/rendering/map/PropRenderer.js"
import {
  FLIGHT_HOVER_HEIGHT,
  advanceFlightVisualHeight,
  getFlightBodyHeight,
  getFlightTargetHeight,
} from "../src/components/BattleGame/rendering/heroes/flightVisuals.js"

test("flight visuals lift an active hero above authored wall heights", () => {
  assert.equal(getFlightTargetHeight({flying: 0}), 0)
  assert.equal(getFlightTargetHeight({}), 0)
  assert.ok(FLIGHT_HOVER_HEIGHT > 4.26)
  assert.equal(getFlightTargetHeight({flying: 1}), FLIGHT_HOVER_HEIGHT)
})

test("flight visuals clear the real top of the authored tree crown", () => {
  const prop = createProp(
    {minX: 480, minY: 352, maxX: 520, maxY: 392, type: "tree"},
    0,
    new THREE.Texture(),
  )
  const visual = prop.children.find(child => child.userData?.role !== "contact-shadow")
  const treeTop = new THREE.Box3().setFromObject(visual, true).max.y
  assert.ok(FLIGHT_HOVER_HEIGHT > treeTop + .35)
  prop.traverse(node => {
    node.geometry?.dispose?.()
    node.material?.dispose?.()
  })
})

test("flight visuals rise and settle back to ground without affecting grounded heroes", () => {
  const rising = advanceFlightVisualHeight(0, {flying: 1}, 0.5)
  const falling = advanceFlightVisualHeight(rising, {flying: 0}, 0.5)
  assert.ok(rising > 3)
  assert.ok(falling < rising)
  assert.ok(falling > 0)
  assert.equal(getFlightBodyHeight(0, 10), 0)
  assert.ok(getFlightBodyHeight(0.01, 0.4) >= 0)
})

test("airborne hero rendering keeps internal model depth ordering during flight", async () => {
  const source = await readFile(new URL("../src/components/BattleGame/rendering/heroes/HeroView.js", import.meta.url), "utf8")
  assert.doesNotMatch(source, /setFlightDepthMode/)
  assert.doesNotMatch(source, /material\.depthTest = false/)
  assert.match(source, /renderer\.clearDepth\(\)/)
  assert.match(source, /flight-depth-resetter/)
  assert.match(source, /flightDepthResetter\.renderOrder = -1/)
  assert.match(source, /this\.model\.renderOrder = flightMix > 0\.05 \? 16 : 0/)
})
