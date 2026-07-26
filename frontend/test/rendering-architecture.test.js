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
import {AssetRegistry, normalizeHeroHeight} from "../src/components/BattleGame/rendering/assets/AssetRegistry.js"
import {GLBHeroController} from "../src/components/BattleGame/rendering/heroes/GLBHeroController.js"
import {turnTowardsAngle} from "../src/components/BattleGame/rendering/heroes/turning.js"
import {createProjectileVisual} from "../src/components/BattleGame/rendering/combat/ProjectileRenderer.js"
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

test("hero turning follows the shortest arc through intermediate directions", () => {
  const quarterTurn = turnTowardsAngle(0, Math.PI / 2, .05)
  assert.equal(quarterTurn > 0, true)
  assert.equal(quarterTurn < Math.PI / 2, true)

  const wrappedTurn = turnTowardsAngle(Math.PI - .1, -Math.PI + .1, .05)
  assert.equal(wrappedTurn > Math.PI - .1, true)
  assert.equal(wrappedTurn < Math.PI + .1, true)
})

test("the hero manifest defines every imported hero with the complete animation state machine", () => {
  assert.deepEqual(Object.keys(HERO_ASSETS), ["Shelly", "Colt", "Barley", "Viper", "Titan", "Shadow", "Spark", "Mandy", "Fairy Mina", "Brock Zeus", "Kaze", "Wukong Mico", "Damian", "Persephone Lumi"])
  for (const name of Object.keys(HERO_ASSETS)) {
    const asset = getHeroAsset(name)
    assert.equal(asset.id, name)
    assert.equal(asset.scale > 0, true)
    assert.deepEqual(Object.keys(asset.clips), ["idle", "run", "aim", "aimSuper", "attack", "super", "spawn", "victory", "defeat"])
  }
  assert.equal(HERO_ASSETS.Shadow.available, true)
  assert.equal(HERO_ASSETS.Mandy.available, true)
  for (const name of ["Fairy Mina","Brock Zeus","Kaze","Wukong Mico","Damian","Persephone Lumi"]) assert.equal(HERO_ASSETS[name].available, true)
  assert.equal(HERO_ASSETS.Shadow.url, "/assets/heroes/needle/needle.glb")
  assert.equal(HERO_ASSETS.Mandy.url, "/assets/heroes/mandy/mandy.glb")
})

test("the runtime renderer has no Canvas2D engine switch or fallback", async () => {
  const source = await readFile(projectFile("src/components/BattleGame/Renderer.js"), "utf8")
  assert.doesNotMatch(source, /CanvasRenderer|battle_renderer|renderer=|getContext\(["']2d["']\)/)
})

test("the battle scene provides PBR lighting and soft shadows for GLB heroes", async () => {
  const source = await readFile(projectFile("src/components/BattleGame/rendering/SceneRoot.js"), "utf8")
  assert.match(source, /HemisphereLight/)
  assert.match(source, /DirectionalLight/)
  assert.match(source, /PCFSoftShadowMap/)
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

test("hero GLBs are normalized to one visual height instead of relying on authoring units", () => {
  const root = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 5, 1), new THREE.MeshBasicMaterial())
  body.position.y = 2.5
  root.add(body)

  normalizeHeroHeight(root, 2.45)

  const bounds = new THREE.Box3().setFromObject(root)
  assert.equal(Math.abs((bounds.max.y - bounds.min.y) - 2.45) < 0.001, true)
  assert.equal(Math.abs(bounds.min.y) < 0.001, true)
})

test("GLBHeroController drives locomotion speed and one-shot upper-body overlays", () => {
  const root = new THREE.Group()
  const hips = new THREE.Bone()
  hips.name = "Hips"
  const spine = new THREE.Bone()
  spine.name = "Spine"
  const arm = new THREE.Bone()
  arm.name = "RightArm"
  const hand = new THREE.Bone()
  hand.name = "RightHand"
  const foot = new THREE.Bone()
  foot.name = "RightFoot"
  hips.add(spine)
  spine.add(arm)
  arm.add(hand)
  hips.add(foot)
  root.add(hips)
  const clips = [
    new THREE.AnimationClip("Idle", 1, [new THREE.QuaternionKeyframeTrack("Hips.quaternion", [0, 1], [0, 0, 0, 1, 0, 0, 0, 1])]),
    new THREE.AnimationClip("Run", 1, [new THREE.QuaternionKeyframeTrack("Hips.quaternion", [0, 1], [0, 0, 0, 1, 0, 0, 0, 1])]),
    new THREE.AnimationClip("Aim", 1, [
      new THREE.QuaternionKeyframeTrack("RightArm.quaternion", [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
    ]),
    new THREE.AnimationClip("Attack", 0.4, [
      new THREE.QuaternionKeyframeTrack("Hips.quaternion", [0, .4], [0, 0, 0, 1, 0, 0, 0, 1]),
      new THREE.QuaternionKeyframeTrack("RightArm.quaternion", [0, .4], [0, 0, 0, 1, 0, 0, 0, 1]),
      new THREE.QuaternionKeyframeTrack("RightFoot.quaternion", [0, .4], [0, 0, 0, 1, 0, 0, 0, 1]),
    ]),
  ]
  const controller = new GLBHeroController(root, clips, {
    idle: "Idle",
    run: "Run",
    aim: "Aim",
    attack: "Attack",
    super: "Super",
  })

  controller.update(.016, {moving: true, aiming: true, speed: 300, referenceSpeed: 240, attackPulse: 1})
  assert.equal(controller.state, "run")
  assert.equal(controller.actions.get("run").timeScale, 1.25)
  assert.equal(controller.actions.get("attack").getClip().tracks.length, 1)
  assert.equal(controller.actions.get("attack").getClip().tracks[0].name, "RightArm.quaternion")
  assert.equal(controller.actions.get("attack").getClip().tracks.some(track => /Foot/.test(track.name)), false)
  assert.equal(controller.overlay, "attack")
  assert.equal(controller.heldProjectile.parent, hand)
  assert.equal(controller.heldProjectile.visible, true)
  assert.equal(controller.actions.get("aim").isRunning(), true)
  assert.equal(controller.aimWeight > 0, true)
  controller.update(.25, {moving: true, aiming: true, speed: 300, referenceSpeed: 240, attackPulse: 1})
  assert.equal(controller.heldProjectile.visible, false)
  controller.dispose()
})

test("GLBHeroController hides a dead model immediately and restores it for spawn", () => {
  const root = new THREE.Group()
  const cactus = new THREE.Group()
  cactus.name = "SpawnCactus"
  cactus.scale.setScalar(.72)
  const heroMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())
  root.add(cactus, heroMesh)
  const controller = new GLBHeroController(root, [], {})
  assert.equal(cactus.visible, true)
  assert.equal(heroMesh.visible, false)
  controller.update(.5, {alive: true})
  assert.equal(cactus.scale.y < .72, true)
  assert.equal(heroMesh.visible, true)
  controller.update(.016, {alive: false})
  assert.equal(root.visible, false)
  controller.update(.016, {alive: true, spawnPulse: 1})
  assert.equal(root.visible, true)
  assert.equal(controller.state, "spawn")
  controller.dispose()
})

test("GLBHeroController can skip Spawn for asynchronously loaded lobby previews", () => {
  const root = new THREE.Group()
  const cactus = new THREE.Group()
  cactus.name = "SpawnCactus"
  const heroMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())
  root.add(cactus, heroMesh)
  const controller = new GLBHeroController(root, [], {}, {spawnOnLoad: false})
  assert.equal(cactus.visible, false)
  assert.equal(heroMesh.visible, true)
  assert.equal(controller.state, null)
  controller.dispose()
})

test("hero equipment profiles hide detached ammo and animate Brock's nearby cloud", () => {
  const minaRoot = new THREE.Group()
  const waterball = new THREE.Mesh(new THREE.SphereGeometry(.2), new THREE.MeshBasicMaterial())
  waterball.name = "waterball_GEO_hide_ingame"
  minaRoot.add(waterball)
  const mina = new GLBHeroController(minaRoot, [], {}, {heroName: "Fairy Mina", spawnOnLoad: false})
  assert.equal(waterball.visible, false)
  mina.dispose()

  const brockRoot = new THREE.Group()
  const cloud = new THREE.Group()
  cloud.name = "HeroAttachment_Cloud"
  cloud.position.set(.8, 1.4, -.15)
  brockRoot.add(cloud)
  const brock = new GLBHeroController(brockRoot, [], {}, {
    heroName: "Brock Zeus",
    attackPulse: 0,
    spawnOnLoad: false,
  })
  brock.update(.1, {alive: true, attackPulse: 1})
  assert.equal(cloud.visible, true)
  assert.equal(cloud.position.distanceTo(new THREE.Vector3(.8, 1.4, -.15)) > 0, true)
  assert.equal(cloud.userData.lightningCharge > 0, true)
  brock.dispose()
})

test("new hero projectiles match the detached object used by the attack", () => {
  const mina = createProjectileVisual({kind: "mina_star_fan"})
  assert.equal(mina.userData.vfxType, "fairy-orb")
  const damian = createProjectileVisual({kind: "damian_dark_orb"})
  assert.equal(damian.userData.vfxType, "thrown-speaker")
})

test("Shadow spore attacks use a layered 3D projectile instead of a primitive ball", () => {
  const visual = createProjectileVisual({kind: "spore", radius: 15, color: "#75D947"})
  assert.equal(visual.isGroup, true)
  assert.equal(visual.name, "NeedleSporeProjectile")
  assert.equal(visual.children.filter(child => child.userData.role === "petal").length, 6)
  assert.equal(visual.children.filter(child => child.userData.role === "thorn").length >= 12, true)
  assert.equal(visual.userData.vfxType, "needle-spore")
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
