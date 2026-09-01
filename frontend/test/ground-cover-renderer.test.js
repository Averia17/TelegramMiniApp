import nodeTest from "node:test"
import assert from "node:assert/strict"
import * as THREE from "three"
import {createGroundCoverField} from "../src/components/BattleGame/rendering/map/GroundCoverRenderer.js"
import {MapRenderer} from "../src/components/BattleGame/rendering/map/MapRenderer.js"

const test = (name, fn) => nodeTest(name, {concurrency: true}, fn)

test("ground cover decorates empty team-map cells without occupying gameplay cells", () => {
  const field = createGroundCoverField({
    width: 480,
    height: 400,
    seed: 20260827,
    walls: [
      {minX: 40, minY: 40, maxX: 80, maxY: 80, type: "wall"},
      {minX: 200, minY: 160, maxX: 240, maxY: 200, type: "vine"},
    ],
  }, "team")

  const grass = field.getObjectByName("ground-cover-grass")
  const vineStems = field.getObjectByName("ground-cover-vine-stems")

  assert.equal(field.userData.decorativeOnly, true)
  assert.ok(grass.count > 0)
  assert.ok(vineStems.count > 0)
  assert.ok(field.userData.coverCells.every(({x, y}) => (
    !(x === 1 && y === 1) && !(x === 5 && y === 4)
  )))

  field.traverse(node => {
    node.geometry?.dispose?.()
    node.material?.dispose?.()
  })
})

test("ground cover is deterministic for the same map", () => {
  const map = {width: 480, height: 400, seed: 20260827, walls: []}
  const first = createGroundCoverField(map, "team")
  const second = createGroundCoverField(map, "team")

  assert.deepEqual(first.userData.coverCells, second.userData.coverCells)
  assert.equal(first.getObjectByName("ground-cover-grass").count, second.getObjectByName("ground-cover-grass").count)
  assert.equal(first.getObjectByName("ground-cover-vine-stems").count, second.getObjectByName("ground-cover-vine-stems").count)

  for (const field of [first, second]) {
    field.traverse(node => {
      node.geometry?.dispose?.()
      node.material?.dispose?.()
    })
  }
})

test("northern team map mounts decorative ground cover", () => {
  const root = new THREE.Group()
  const renderer = new MapRenderer(root, {waterTexture: new THREE.Texture()})
  renderer.sync({
    width: 480,
    height: 400,
    name: "team-battle-northern",
    seed: 20260827,
    walls: [],
  })
  renderer.ground.setTheme("team")
  renderer.sync({
    width: 480,
    height: 400,
    name: "team-battle-northern",
    seed: 20260827,
    walls: [],
  })

  assert.equal(renderer.groundCoverField.userData.decorativeOnly, true)
  assert.equal(root.getObjectByName("ground-cover-field"), renderer.groundCoverField)
  renderer.dispose()
})
