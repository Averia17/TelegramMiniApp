import nodeTest from "node:test"
import assert from "node:assert/strict"
import * as THREE from "three"
import {WORLD_SCALE} from "../src/components/BattleGame/rendering/shared/coordinates.js"
import {
  BUSH_TILE_SIZE,
  BUSH_NEAR_OPACITY,
  BUSH_CLUSTER_NEAR_RADIUS,
  BUSH_CLUSTER_FADE_RADIUS,
  createBushField,
  getBushVisibilityOpacity,
  getBushTileVisibilityOpacity,
  getBushClusterVisibilityOpacity,
  subdivideBushWalls,
  splitBushWallComponents,
} from "../src/components/BattleGame/rendering/map/BushRenderer.js"
import {MapRenderer} from "../src/components/BattleGame/rendering/map/MapRenderer.js"

const test = (name, fn) => nodeTest(name, {concurrency: true}, fn)

test("bush fallback uses fixed-size tiles with a scalloped crown", () => {
  const field = createBushField([
    {minX: 20, minY: 20, maxX: 60, maxY: 60, type: "bush"},
  ])

  assert.equal(field.isGroup, true)
  const base = field.getObjectByName("bush-field-base")
  const crown = field.getObjectByName("bush-field-crown")
  const foreground = field.getObjectByName("bush-field-foreground")
  assert.equal(base.isInstancedMesh, true)
  assert.equal(base.count, 1)
  assert.ok(crown.count > 3)
  assert.ok(foreground.isInstancedMesh)
  assert.equal(foreground.count, field.userData.bushTiles.length * 5)
  assert.ok(foreground.count < crown.count)
  assert.ok(foreground.renderOrder > crown.renderOrder)
  const foregroundMatrix = new THREE.Matrix4()
  foreground.getMatrixAt(0, foregroundMatrix)
  assert.ok(new THREE.Vector3().setFromMatrixPosition(foregroundMatrix).z > 60 * WORLD_SCALE)
  assert.equal(base.geometry.type, "BoxGeometry")
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

test("bush fields are assembled from fixed-size square tiles, including irregular shapes", () => {
  const tiles = subdivideBushWalls([
    {minX: 0, minY: 0, maxX: 120, maxY: 120, type: "bush"},
    {minX: 40, minY: 40, maxX: 80, maxY: 80, type: "bush"},
  ])

  assert.equal(BUSH_TILE_SIZE, 40)
  assert.equal(tiles.length, 9)
  assert.ok(tiles.every(tile => tile.maxX - tile.minX === BUSH_TILE_SIZE))
  assert.ok(tiles.every(tile => tile.maxY - tile.minY === BUSH_TILE_SIZE))

  const field = createBushField([
    {minX: 0, minY: 0, maxX: 40, maxY: 40, type: "bush"},
    {minX: 40, minY: 0, maxX: 80, maxY: 40, type: "bush"},
    {minX: 0, minY: 40, maxX: 40, maxY: 80, type: "bush"},
  ])
  assert.equal(field.userData.bushTiles.length, 3)
  assert.equal(field.getObjectByName("bush-field-base").count, 3)
  field.traverse(node => {
    if (node.geometry) node.geometry.dispose()
    if (node.material) node.material.dispose()
  })
})

test("bush tile visibility fades the tile containing the hero before distant tiles", () => {
  const nearTile = {minX: 100, minY: 100, maxX: 140, maxY: 140, type: "bush"}
  const adjacentTile = {minX: 140, minY: 100, maxX: 180, maxY: 140, type: "bush"}
  const secondTile = {minX: 180, minY: 100, maxX: 220, maxY: 140, type: "bush"}
  const farTile = {minX: 260, minY: 100, maxX: 300, maxY: 140, type: "bush"}

  assert.equal(getBushTileVisibilityOpacity({x: 120, y: 120}, nearTile), BUSH_NEAR_OPACITY)
  assert.ok(getBushTileVisibilityOpacity({x: 120, y: 120}, adjacentTile) > BUSH_NEAR_OPACITY)
  assert.equal(getBushTileVisibilityOpacity({x: 120, y: 120}, secondTile), 1)
  assert.ok(getBushTileVisibilityOpacity({x: 120, y: 120}, farTile) > BUSH_NEAR_OPACITY)
  assert.equal(getBushTileVisibilityOpacity({x: 120, y: 120}, farTile), 1)

  const field = createBushField([nearTile, farTile])
  const crown = field.getObjectByName("bush-field-crown")
  const foreground = field.getObjectByName("bush-field-foreground")
  assert.ok(crown.geometry.getAttribute("instanceOpacity"))
  assert.ok(crown.renderOrder > field.getObjectByName("bush-field-base").renderOrder)
  const shader = {
    vertexShader: "#include <common>\n#include <begin_vertex>",
    fragmentShader: "#include <common>\n#include <color_fragment>",
  }
  crown.material.onBeforeCompile(shader)
  assert.match(shader.vertexShader, /instanceOpacity/)
  assert.match(shader.fragmentShader, /pow\(vInstanceOpacity, 1\.65\)/)
  const foregroundShader = {
    vertexShader: "#include <common>\n#include <begin_vertex>",
    fragmentShader: "#include <common>\n#include <color_fragment>",
  }
  foreground.material.onBeforeCompile(foregroundShader)
  assert.match(foregroundShader.fragmentShader, /pow\(vInstanceOpacity, 1\.25\)/)
  field.traverse(node => {
    if (node.geometry) node.geometry.dispose()
    if (node.material) node.material.dispose()
  })
})

test("bush cluster visibility fades only a short local pocket around the hero", () => {
  const focus = {x: 120, y: 120}

  assert.equal(BUSH_CLUSTER_NEAR_RADIUS, 8)
  assert.equal(BUSH_CLUSTER_FADE_RADIUS, 26)
  assert.equal(getBushClusterVisibilityOpacity(focus, {x: 120, y: 120}), BUSH_NEAR_OPACITY)
  assert.ok(getBushClusterVisibilityOpacity(focus, {x: 140, y: 120}) < 1)
  assert.equal(getBushClusterVisibilityOpacity(focus, {x: 160, y: 120}), 1)

  const field = createBushField([
    {minX: 100, minY: 100, maxX: 140, maxY: 140, type: "bush"},
  ])
  const crown = field.getObjectByName("bush-field-crown")
  const foreground = field.getObjectByName("bush-field-foreground")
  assert.equal(crown.userData.bushVisibilityPositions.length, crown.count)
  assert.equal(foreground.userData.bushVisibilityPositions.length, foreground.count)
  assert.ok(crown.userData.bushVisibilityPositions.every(position => Number.isFinite(position.x)))
  assert.equal(field.getObjectByName("bush-field-base").userData.bushVisibilityPositions, undefined)
  field.traverse(node => {
    if (node.geometry) node.geometry.dispose()
    if (node.material) node.material.dispose()
  })
})

test("bush support volume follows the square tile footprint instead of a circular silhouette", () => {
  const field = createBushField([
    {minX: 20, minY: 20, maxX: 60, maxY: 60, type: "bush"},
  ])
  const base = field.getObjectByName("bush-field-base")

  assert.equal(base.geometry.type, "BoxGeometry")
  assert.equal(base.geometry.parameters.width, 1)
  assert.equal(base.geometry.parameters.depth, 1)
  assert.equal(field.getObjectByName("bush-field-bed").geometry.type, "PlaneGeometry")

  field.traverse(node => {
    if (node.geometry) node.geometry.dispose()
    if (node.material) node.material.dispose()
  })
})

test("adjacent bush colliders keep one shared instanced field with one tile per collider", () => {
  const field = createBushField([
    {minX: 20, minY: 20, maxX: 60, maxY: 60, type: "bush"},
    {minX: 60, minY: 20, maxX: 100, maxY: 60, type: "bush"},
    {minX: 20, minY: 60, maxX: 60, maxY: 100, type: "bush"},
    {minX: 60, minY: 60, maxX: 100, maxY: 100, type: "bush"},
  ])

  assert.equal(field.getObjectByName("bush-field-base").count, 4)
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
  assert.ok(getBushVisibilityOpacity({x: 180, y: 120}, [wall]) < 1)
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
  const opacity = base.geometry.getAttribute("instanceOpacity")
  assert.ok(opacity.getX(0) < 1)
  assert.equal(base.material.opacity, .62)

  mapRenderer.setFocus(900, 900)
  mapRenderer.update(1 / 60)
  assert.equal(opacity.getX(0), 1)
  mapRenderer.dispose()
})

test("map renderer fades only the nearest tiles inside one large grass field", () => {
  const root = new THREE.Group()
  const mapRenderer = new MapRenderer(root, {waterTexture: new THREE.Texture()})
  mapRenderer.sync({
    width: 520,
    height: 120,
    walls: [{minX: 20, minY: 20, maxX: 420, maxY: 60, type: "bush"}],
  })

  mapRenderer.setFocus(40, 40)
  mapRenderer.update(1 / 60)
  const field = [...mapRenderer.objects.values()][0]
  const opacity = field.getObjectByName("bush-field-base").geometry.getAttribute("instanceOpacity")
  assert.equal(opacity.count, 10)
  assert.ok(Math.abs(opacity.getX(0) - BUSH_NEAR_OPACITY) < 1e-6)
  assert.ok(opacity.getX(2) > BUSH_NEAR_OPACITY)
  assert.equal(opacity.getX(2), 1)
  assert.equal(opacity.getX(9), 1)
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
})
