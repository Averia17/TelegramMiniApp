import test from "node:test"
import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"
import {fileURLToPath} from "node:url"

import {
  ENVIRONMENT_ASSETS,
  HERO_ASSETS,
  getHeroAsset,
  resolveEnvironmentVisual,
} from "../src/components/BattleGame/rendering/assets/assetManifest.js"
import {AssetRegistry} from "../src/components/BattleGame/rendering/assets/AssetRegistry.js"
import {HeroAnimationController} from "../src/components/BattleGame/rendering/heroes/HeroAnimationController.js"
import {createMapSignature} from "../src/components/BattleGame/rendering/map/mapSignature.js"
import {
  getEnvironmentPlacements,
  replaceFallbackWithEnvironment,
} from "../src/components/BattleGame/rendering/map/environmentPlacement.js"
import {WORLD_SCALE, worldToScene, sceneToWorld} from "../src/components/BattleGame/rendering/shared/coordinates.js"
import * as THREE from "three"

const projectFile = relativePath => fileURLToPath(new URL(`../${relativePath}`, import.meta.url))

test("world coordinates round-trip through the shared 2.5D transform", () => {
  const scene = worldToScene(320, 640, 24)
  assert.deepEqual(scene.toArray(), [320 * WORLD_SCALE, 24 * WORLD_SCALE, 640 * WORLD_SCALE])
  assert.deepEqual(sceneToWorld(scene), {x: 320, y: 640, height: 24})
})

test("the hero manifest defines all seven supported heroes and stable animation slots", () => {
  assert.deepEqual(Object.keys(HERO_ASSETS), ["Shelly", "Colt", "Barley", "Viper", "Titan", "Shadow", "Spark"])
  for (const name of Object.keys(HERO_ASSETS)) {
    const asset = getHeroAsset(name)
    assert.equal(asset.id, name)
    assert.equal(asset.scale > 0, true)
    assert.deepEqual(Object.keys(asset.clips), ["idle", "run", "attack", "super", "hit", "death"])
  }
})

test("the runtime renderer has no Canvas2D engine switch or fallback", async () => {
  const source = await readFile(projectFile("src/components/BattleGame/Renderer.js"), "utf8")
  assert.doesNotMatch(source, /CanvasRenderer|battle_renderer|renderer=|getContext\(["']2d["']\)/)
})

test("AssetRegistry loads each GLB once and returns independent clones", async () => {
  let loads = 0
  const template = new THREE.Group()
  template.name = "Template"
  const registry = new AssetRegistry({
    manifest: {
      TestHero: {
        id: "TestHero",
        url: "/test.glb",
        available: true,
        scale: 1,
        rotationOffset: 0,
        clips: {idle: "Idle"},
      },
    },
    load: async () => {
      loads++
      return {scene: template, animations: [new THREE.AnimationClip("Idle", 1, [])]}
    },
  })

  const [first, second] = await Promise.all([
    registry.instantiateHero("TestHero"),
    registry.instantiateHero("TestHero"),
  ])

  assert.equal(loads, 1)
  assert.notEqual(first.root, second.root)
  assert.equal(first.animations[0].name, "Idle")
  assert.equal(second.animations[0].name, "Idle")
})

test("HeroAnimationController selects semantic clips and ignores missing optional clips", () => {
  const root = new THREE.Group()
  const clips = [
    new THREE.AnimationClip("Idle", 1, []),
    new THREE.AnimationClip("Run", 1, []),
    new THREE.AnimationClip("Attack", 0.4, []),
  ]
  const controller = new HeroAnimationController(root, clips, {
    idle: "Idle",
    run: "Run",
    attack: "Attack",
    super: "Super",
  })

  assert.equal(controller.play("idle"), true)
  assert.equal(controller.current, "idle")
  assert.equal(controller.play("run"), true)
  assert.equal(controller.current, "run")
  assert.equal(controller.play("super"), false)
  assert.equal(controller.current, "run")
  controller.dispose()
})

test("map visuals are optional and never replace semantic collision types", () => {
  assert.equal(resolveEnvironmentVisual({type: "crates"}), "crate_a")
  assert.equal(resolveEnvironmentVisual({type: "destructible", visual: "desert_wall_b"}), "desert_wall_b")
  assert.equal(resolveEnvironmentVisual({type: "unknown"}), null)
})

test("environment manifest defines an explicit placement contract", () => {
  for (const asset of Object.values(ENVIRONMENT_ASSETS)) {
    assert.equal(asset.scale > 0, true)
    assert.equal(Number.isFinite(asset.rotationOffset), true)
    assert.equal(["single", "repeat"].includes(asset.placement), true)
    assert.equal(asset.footprint > 0, true)
  }
})

test("AssetRegistry caches environment loads and returns transformed independent clones", async () => {
  let loads = 0
  const template = new THREE.Group()
  const registry = new AssetRegistry({
    environmentManifest: {
      crate_a: {
        url: "/crate.glb",
        available: true,
        scale: 1.5,
        rotationOffset: Math.PI / 2,
        placement: "single",
        footprint: 40,
      },
    },
    load: async () => {
      loads++
      return {scene: template, animations: []}
    },
  })

  const [first, second] = await Promise.all([
    registry.instantiateEnvironment("crate_a"),
    registry.instantiateEnvironment("crate_a"),
  ])

  assert.equal(loads, 1)
  assert.notEqual(first.root, second.root)
  assert.equal(first.root.scale.x, 1.5)
  assert.equal(first.root.rotation.y, Math.PI / 2)
})

test("map signature changes when only a wall visual changes", () => {
  const first = {width: 100, height: 100, walls: [{minX: 0, minY: 0, maxX: 40, maxY: 40, type: "crates", visual: "crate_a"}]}
  const second = {width: 100, height: 100, walls: [{...first.walls[0], visual: "barrel_a"}]}
  assert.notEqual(createMapSignature(first), createMapSignature(second))
})

test("an environment GLB replaces its fallback without moving the map container", async () => {
  const container = new THREE.Group()
  container.position.set(4, 0, 7)
  const fallback = new THREE.Group()
  const glb = new THREE.Group()
  container.add(fallback)

  const replaced = await replaceFallbackWithEnvironment(
    container,
    fallback,
    {type: "crates"},
    async () => ({root: glb, asset: {placement: "single", footprint: 40}}),
  )

  assert.equal(replaced, true)
  assert.deepEqual(container.position.toArray(), [4, 0, 7])
  assert.equal(container.children.includes(fallback), false)
  assert.equal(container.children.includes(glb), true)
})

test("repeat placement fills a rectangular collider in world-space footprint cells", () => {
  const placements = getEnvironmentPlacements(
    {minX: 0, minY: 0, maxX: 80, maxY: 40},
    {placement: "repeat", footprint: 40},
    0.065,
  )
  assert.deepEqual(placements, [
    {x: -1.3, z: 0},
    {x: 1.3, z: 0},
  ])
})

test("a stale environment load is discarded instead of entering the scene", async () => {
  const container = new THREE.Group()
  const fallback = new THREE.Group()
  const staleRoot = new THREE.Group()
  let discarded = null
  container.add(fallback)

  const replaced = await replaceFallbackWithEnvironment(
    container,
    fallback,
    {type: "crates"},
    async () => ({root: staleRoot}),
    () => false,
    undefined,
    root => { discarded = root },
  )

  assert.equal(replaced, false)
  assert.equal(container.children.includes(fallback), true)
  assert.equal(container.children.includes(staleRoot), false)
  assert.equal(discarded, staleRoot)
})
