import test from "node:test"
import assert from "node:assert/strict"
import {
  appendEditorItem,
  createEditorHistory,
  createEditorMap,
  duplicateEditorItem,
  exportEditorMap,
  getEditorItemBounds,
  isEditorItemHit,
  listEditorItems,
  removeEditorItem,
  redoEditorHistory,
  recordEditorHistory,
  undoEditorHistory,
  updateEditorItem,
} from "../src/components/BattleGame/mapEditor.js"
import {createProp} from "../src/components/BattleGame/rendering/map/PropRenderer.js"
import {MapRenderer} from "../src/components/BattleGame/rendering/map/MapRenderer.js"
import {WORLD_SCALE} from "../src/components/BattleGame/rendering/shared/coordinates.js"
import * as THREE from "three"

const sourceMap = {
  id: "team-battle-northern",
  width: 800,
  height: 600,
  tileSize: 40,
  walls: [{minX: 40, minY: 80, maxX: 80, maxY: 120, type: "tree"}],
  features: [{id: "bridge-a", type: "river_bridge", x: 400, y: 300, scale: 1}],
}

test("editor map clones canonical walls and features with stable selection ids", () => {
  const map = createEditorMap(sourceMap)

  assert.notEqual(map, sourceMap)
  assert.notEqual(map.walls, sourceMap.walls)
  assert.notEqual(map.features, sourceMap.features)
  assert.equal(map.walls[0].editorId, "wall-1")
  assert.equal(map.features[0].editorId, "feature-1")
  assert.equal(sourceMap.walls[0].editorId, undefined)
})

test("editor binds authored city collisions to their feature and moves them together", () => {
  const source = {
    ...sourceMap,
    walls: [
      {minX: 80, minY: 80, maxX: 120, maxY: 120, type: "city_object", linkedFeatureId: "house-a"},
      {minX: 600, minY: 80, maxX: 640, maxY: 120, type: "city_object"},
    ],
    features: [{id: "house-a", type: "city_building", x: 100, y: 100, scale: 1}],
  }
  const map = createEditorMap(source)
  const moved = updateEditorItem(map, {kind: "feature", editorId: "feature-1"}, {x: 180, y: 140})

  assert.equal(map.walls[0].linkedFeatureId, "house-a")
  assert.equal(moved.walls[0].minX, 160)
  assert.equal(moved.walls[0].minY, 120)
  assert.equal(moved.walls[1].minX, 600)
  assert.equal(moved.features[0].x, 180)
})

test("editor rotates linked collision geometry around the feature anchor", () => {
  const map = createEditorMap({
    ...sourceMap,
    walls: [{minX: 80, minY: 90, maxX: 120, maxY: 110, type: "city_object", linkedFeatureId: "house-a"}],
    features: [{id: "house-a", type: "city_building", x: 100, y: 100, scale: 1, rotation: 0}],
  })
  const rotated = updateEditorItem(map, {kind: "feature", editorId: "feature-1"}, {rotation: Math.PI / 2})

  assert.ok(Math.abs(rotated.walls[0].minX - 90) < 1e-8)
  assert.ok(Math.abs(rotated.walls[0].maxX - 110) < 1e-8)
  assert.ok(Math.abs(rotated.walls[0].minY - 80) < 1e-8)
  assert.ok(Math.abs(rotated.walls[0].maxY - 120) < 1e-8)
})

test("editor infers a missing link only for a nearby authored city collision", () => {
  const map = createEditorMap({
    ...sourceMap,
    walls: [
      {minX: 80, minY: 80, maxX: 120, maxY: 120, type: "city_object"},
      {minX: 600, minY: 80, maxX: 640, maxY: 120, type: "city_object"},
    ],
    features: [{id: "house-a", type: "city_building", x: 100, y: 100, scale: 1}],
  })

  assert.equal(map.walls[0].linkedFeatureId, "house-a")
  assert.equal(map.walls[1].linkedFeatureId, undefined)
})

test("deleting a feature removes its bound collision package", () => {
  const map = createEditorMap({
    ...sourceMap,
    walls: [{minX: 80, minY: 80, maxX: 120, maxY: 120, type: "city_object", linkedFeatureId: "house-a"}],
    features: [{id: "house-a", type: "city_building", x: 100, y: 100, scale: 1}],
  })

  const removed = removeEditorItem(map, {kind: "feature", editorId: "feature-1"})
  assert.equal(removed.features.length, 0)
  assert.equal(removed.walls.length, 0)
})

test("duplicating a feature duplicates its bound collision package", () => {
  const map = createEditorMap({
    ...sourceMap,
    walls: [{minX: 80, minY: 80, maxX: 120, maxY: 120, type: "city_object", linkedFeatureId: "house-a"}],
    features: [{id: "house-a", type: "city_building", x: 100, y: 100, scale: 1}],
  })

  const duplicated = duplicateEditorItem(map, {kind: "feature", editorId: "feature-1"}, {x: 200, y: 180})
  assert.equal(duplicated.features.length, 2)
  assert.equal(duplicated.walls.length, 2)
  assert.equal(duplicated.walls[1].linkedFeatureId, duplicated.features[1].id)
  assert.equal(duplicated.walls[1].minX, 180)
  assert.equal(duplicated.walls[1].minY, 160)
})

test("editor operations add, update and remove a wall without mutating the previous map", () => {
  const map = createEditorMap(sourceMap)
  const added = appendEditorItem(map, {kind: "wall", type: "barrels", x: 200, y: 240, width: 40, depth: 80})
  const selection = {kind: "wall", editorId: added.walls[1].editorId}
  const moved = updateEditorItem(added, selection, {rotation: Math.PI / 2, minX: 180, maxX: 220})
  const removed = removeEditorItem(moved, selection)

  assert.equal(added.walls.length, 2)
  assert.equal(added.walls[1].rotation, 0)
  assert.equal(moved.walls[1].rotation, Math.PI / 2)
  assert.equal(removed.walls.length, 1)
  assert.equal(map.walls.length, 1)
})

test("editor lists both renderable collections and exports a clean map contract", () => {
  const map = appendEditorItem(createEditorMap(sourceMap), {
    kind: "feature",
    type: "city_building",
    x: 160,
    y: 200,
    scale: 1.25,
    rotation: .4,
  })
  const items = listEditorItems(map)
  const exported = JSON.parse(exportEditorMap(map))

  assert.deepEqual(items.map(item => item.kind), ["wall", "feature", "feature"])
  assert.equal(exported.walls[0].editorId, undefined)
  assert.equal(exported.features[0].editorId, undefined)
  assert.equal(exported.features[1].rotation, .4)
})

test("editor hit testing covers the full footprint of a linked feature", () => {
  const map = createEditorMap({
    ...sourceMap,
    walls: [
      {minX: 40, minY: 40, maxX: 160, maxY: 80, type: "city_object", linkedFeatureId: "base-a"},
      {minX: 40, minY: 80, maxX: 160, maxY: 160, type: "city_object", linkedFeatureId: "base-a"},
    ],
    features: [{id: "base-a", type: "base_compound", x: 100, y: 100, scale: 1}],
  })
  const feature = listEditorItems(map).find(item => item.kind === "feature")

  assert.deepEqual(getEditorItemBounds(map, feature), {minX: 40, minY: 40, maxX: 160, maxY: 160})
  assert.equal(isEditorItemHit(map, feature, {x: 145, y: 145}), true)
  assert.equal(isEditorItemHit(map, feature, {x: 175, y: 145}), false)
})

test("editor hit testing respects standalone object rotation", () => {
  const map = createEditorMap({
    ...sourceMap,
    walls: [{minX: 80, minY: 90, maxX: 120, maxY: 110, type: "crates", rotation: Math.PI / 2}],
    features: [],
  })
  const wall = listEditorItems(map).find(item => item.kind === "wall")

  assert.equal(isEditorItemHit(map, wall, {x: 100, y: 118}), true)
  assert.equal(isEditorItemHit(map, wall, {x: 118, y: 100}), false)
})

test("environment props honor an explicit editor rotation", () => {
  const prop = createProp({
    minX: 20,
    minY: 20,
    maxX: 60,
    maxY: 60,
    type: "crates",
    rotation: Math.PI / 2,
  }, 0, new THREE.Texture())

  assert.equal(prop.rotation.y, Math.PI / 2)
  prop.traverse(node => {
    node.geometry?.dispose?.()
    node.material?.dispose?.()
  })
})

test("existing team compositions follow editor position, rotation and scale changes", () => {
  const root = new THREE.Group()
  const renderer = new MapRenderer(root, {waterTexture: new THREE.Texture()})
  const firstMap = {width: 400, height: 400, walls: [], features: [{id: "bridge-a", type: "river_bridge", x: 40, y: 60, scale: 1}]}
  renderer.sync(firstMap)
  const feature = renderer.featureObjects.get("bridge-a")

  renderer.sync({...firstMap, features: [{...firstMap.features[0], x: 120, y: 140, scale: 1.4, rotation: .6, editorRotation: true}]})

  assert.equal(renderer.featureObjects.get("bridge-a"), feature)
  assert.equal(feature.position.x, 120 * WORLD_SCALE)
  assert.equal(feature.position.z, 140 * WORLD_SCALE)
  assert.equal(feature.rotation.y, .6)
  assert.equal(feature.scale.x, 1.4)
  renderer.dispose()
})

test("editor preview moves mounted objects without rebuilding the map batches", () => {
  const root = new THREE.Group()
  const renderer = new MapRenderer(root, {waterTexture: new THREE.Texture()})
  const firstMap = {width: 400, height: 400, walls: [{minX: 40, minY: 40, maxX: 80, maxY: 80, type: "building_wall", editorId: "wall-1"}], features: []}
  renderer.sync(firstMap)
  const signature = renderer.signature
  const object = [...renderer.objects.values()][0]

  renderer.previewEditorMap({...firstMap, walls: [{...firstMap.walls[0], minX: 120, maxX: 160, minY: 140, maxY: 180}]})

  assert.equal(renderer.signature, signature)
  assert.equal(object.position.x, 140 * WORLD_SCALE)
  assert.equal(object.position.z, 160 * WORLD_SCALE)
  renderer.dispose()
})

test("editor history undoes and redoes map changes without losing the current state", () => {
  const initial = createEditorMap(sourceMap)
  const moved = updateEditorItem(initial, {kind: "wall", editorId: "wall-1"}, {minX: 200, maxX: 240})
  const recorded = recordEditorHistory(createEditorHistory(initial), moved)

  const undone = undoEditorHistory(recorded)
  const redone = redoEditorHistory(undone)

  assert.equal(undone.present.walls[0].minX, 40)
  assert.equal(undone.future.length, 1)
  assert.equal(redone.present.walls[0].minX, 200)
  assert.equal(redone.past.length, 1)
})
