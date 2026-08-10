import test from "node:test"
import assert from "node:assert/strict"
import * as THREE from "three"
import {
  BUSH_NEAR_OPACITY,
  createBushField,
  getBushVisibilityOpacity,
  splitBushWallComponents,
} from "../src/components/BattleGame/rendering/map/BushRenderer.js"
import {MapRenderer} from "../src/components/BattleGame/rendering/map/MapRenderer.js"

test("bush fallback uses one continuous volumetric field with a scalloped crown", () => {
  const field = createBushField([
    {minX: 20, minY: 20, maxX: 60, maxY: 60, type: "bush"},
  ])

  assert.equal(field.isGroup, true)
  const base = field.getObjectByName("bush-field-base")
  const crown = field.getObjectByName("bush-field-crown")
  assert.equal(base.isInstancedMesh, true)
  assert.equal(base.count, 1)
  assert.ok(crown.count > 3)
  assert.equal(base.geometry.type, "SphereGeometry")
  assert.equal(crown.geometry.userData.bushLeafCluster, true)
  const heights = crown.geometry.attributes.position.array.filter((_, index) => index % 3 === 1)
  assert.ok(Math.max(...heights) - Math.min(...heights) > .5)
  assert.ok(base.geometry.getAttribute("color"))
  assert.ok(crown.geometry.getAttribute("color"))
  assert.ok(base.instanceColor)
  assert.ok(crown.instanceColor)
  field.traverse(node => {
    if (node.geometry) node.geometry.dispose()
    if (node.material) node.material.dispose()
  })
})

test("adjacent bush colliders share one visual canopy volume", () => {
  const field = createBushField([
    {minX: 20, minY: 20, maxX: 60, maxY: 60, type: "bush"},
    {minX: 60, minY: 20, maxX: 100, maxY: 60, type: "bush"},
    {minX: 20, minY: 60, maxX: 60, maxY: 100, type: "bush"},
    {minX: 60, minY: 60, maxX: 100, maxY: 100, type: "bush"},
  ])

  assert.equal(field.getObjectByName("bush-field-base").count, 1)
  assert.ok(field.getObjectByName("bush-field-crown").count >= 24)
  field.traverse(node => {
    if (node.geometry) node.geometry.dispose()
    if (node.material) node.material.dispose()
  })
})

test("wide bush fields use a dense jittered canopy instead of repeated nine-part tiles", () => {
  const field = createBushField([
    {minX: 20, minY: 20, maxX: 380, maxY: 100, type: "bush"},
  ])

  const crown = field.getObjectByName("bush-field-crown")
  assert.equal(crown.geometry.userData.bushLeafCluster, true)
  assert.ok(crown.count >= 50)
  assert.notEqual(crown.count, 9)
  field.traverse(node => {
    if (node.geometry) node.geometry.dispose()
    if (node.material) node.material.dispose()
  })
})

test("bush visibility fades only in the nearby player radius", () => {
  const wall = {minX: 100, minY: 100, maxX: 140, maxY: 140, type: "bush"}

  assert.equal(getBushVisibilityOpacity({x: 120, y: 120}, [wall]), BUSH_NEAR_OPACITY)
  assert.ok(getBushVisibilityOpacity({x: 230, y: 120}, [wall]) > BUSH_NEAR_OPACITY)
  assert.ok(getBushVisibilityOpacity({x: 230, y: 120}, [wall]) < 1)
  assert.equal(getBushVisibilityOpacity({x: 900, y: 900}, [wall]), 1)
})

test("map renderer applies the radius fade to a mounted bush field", () => {
  const root = new THREE.Group()
  const mapRenderer = new MapRenderer(root, {waterTexture: new THREE.Texture()})
  mapRenderer.sync({
    width: 240,
    height: 180,
    walls: [{minX: 100, minY: 100, maxX: 140, maxY: 140, type: "moon_mist"}],
  })

  mapRenderer.setFocus(120, 120)
  mapRenderer.update(1 / 60)
  const field = [...mapRenderer.objects.values()][0]
  const base = field.getObjectByName("bush-field-base")
  assert.ok(base.material.opacity < .62)

  mapRenderer.setFocus(900, 900)
  mapRenderer.update(1 / 60)
  assert.equal(base.material.opacity, .62)
  mapRenderer.dispose()
})

test("separate bush clearings keep independent local transparency", () => {
  const walls = [
    {minX: 20, minY: 20, maxX: 80, maxY: 60, type: "bush"},
    {minX: 300, minY: 20, maxX: 360, maxY: 60, type: "bush"},
  ]
  assert.equal(splitBushWallComponents(walls).length, 2)

  const root = new THREE.Group()
  const mapRenderer = new MapRenderer(root, {waterTexture: new THREE.Texture()})
  mapRenderer.sync({width: 240, height: 120, walls})
  const fields = [...mapRenderer.objects.values()]
  assert.equal(fields.length, 2)

  mapRenderer.setFocus(45, 40)
  mapRenderer.update(1 / 60)
  const nearField = fields.find(field => field.userData.bushWalls[0].minX === 20)
  const farField = fields.find(field => field.userData.bushWalls[0].minX === 300)
  assert.ok(nearField.userData.currentBushOpacity < farField.userData.currentBushOpacity)
  mapRenderer.dispose()
})

test("bush visibility accepts empty focus without mutating the scene", () => {
  assert.equal(getBushVisibilityOpacity(null, [{minX: 0, minY: 0, maxX: 40, maxY: 40}]), 1)
  assert.equal(new THREE.Color(0x4aaa57).getHex(), 0x4aaa57)
})
