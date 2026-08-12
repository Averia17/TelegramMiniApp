import test from "node:test"
import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"
import {fileURLToPath} from "node:url"

import {
  HERO_ASSETS,
  getHeroAsset,
  resolveHeroName,
} from "../src/components/BattleGame/rendering/assets/assetManifest.js"
import {
  AssetRegistry,
  assetRegistry,
  mergeHeroRenderParts,
  normalizeHeroHeight,
} from "../src/components/BattleGame/rendering/assets/AssetRegistry.js"
import {GLBHeroController} from "../src/components/BattleGame/rendering/heroes/GLBHeroController.js"
import {turnTowardsAngle} from "../src/components/BattleGame/rendering/heroes/turning.js"
import {
  BUSH_HERO_OPACITY,
  getBushConcealmentMix,
} from "../src/components/BattleGame/rendering/heroes/BushConcealment.js"
import {createProjectileVisual} from "../src/components/BattleGame/rendering/combat/ProjectileRenderer.js"
import {
  MonsterRenderer,
  getDamageBarFractions,
  formatHealthLabel,
} from "../src/components/BattleGame/rendering/monsters/MonsterRenderer.js"
import {getBattleWebGLContext} from "../src/components/BattleGame/rendering/SceneRoot.js"
import {
  acquirePreviewSlot,
  previewRendererCount,
  registerPreviewRenderer,
  releaseAllPreviewContexts,
} from "../src/components/BattleGame/rendering/shared/previewContextRegistry.js"
import {NetworkSimulation} from "../src/components/BattleGame/NetworkSimulation.js"
import {GameClient, preserveAuthoritativeMapWalls} from "../src/components/BattleGame/GameClient.js"
import {CameraRig, fitVerticalSpanToMap} from "../src/components/BattleGame/rendering/CameraRig.js"
import {AimRenderer} from "../src/components/BattleGame/rendering/combat/AimRenderer.js"
import {createMapSignature} from "../src/components/BattleGame/rendering/map/mapSignature.js"
import {
  MapRenderer,
  createStormRingGeometry,
  shouldRefreshEnvironmentFocus,
  smoothStormRadius,
} from "../src/components/BattleGame/rendering/map/MapRenderer.js"
import {GroundRenderer} from "../src/components/BattleGame/rendering/map/GroundRenderer.js"
import {createProp} from "../src/components/BattleGame/rendering/map/PropRenderer.js"
import {createBushField} from "../src/components/BattleGame/rendering/map/BushRenderer.js"
import {PickupRenderer} from "../src/components/BattleGame/rendering/map/PickupRenderer.js"
import {EffectRenderer} from "../src/components/BattleGame/rendering/combat/EffectRenderer.js"
import {getIslandPhaseIndex, getIslandPhaseProgress} from "../src/components/BattleGame/phaseVisuals.js"
import {
  getBattlePlayerCount,
  getBattleRewardMessage,
  getPlayerBattleStats,
  getPresentedBattleResult,
  getStateBattleResult,
  getSynchronizedBattleView,
} from "../src/components/BattleGame/battleOutcome.js"
import {isAlivePlayerState} from "../src/components/BattleGame/rendering/heroes/playerVisibility.js"
import {formatHeroHealthLabel, getHeroHealthFraction} from "../src/components/BattleGame/rendering/heroes/healthBadge.js"
import {ANIMATION_REFERENCE_SPEED, HEROES_CONFIG, RUNTIME_ANIMATION_REFERENCE_SPEED} from "../src/components/BattleGame/heroesConfig.js"
import {WORLD_SCALE, worldToScene, sceneToWorld} from "../src/components/BattleGame/rendering/shared/coordinates.js"
import * as THREE from "three"

const projectFile = relativePath => fileURLToPath(new URL(`../${relativePath}`, import.meta.url))

test("compact mobile snapshots cannot erase an already received battle map", () => {
  const walls = [{minX: 0, minY: 0, maxX: 100, maxY: 50, type: "wall"}]
  const previous = {width: 1200, height: 900, walls}

  assert.equal(preserveAuthoritativeMapWalls(
    {width: 1200, height: 900, walls: null},
    previous,
  ).walls, walls)
  assert.equal(preserveAuthoritativeMapWalls(
    {width: 1200, height: 900, walls: []},
    previous,
  ).walls, walls)
  assert.deepEqual(preserveAuthoritativeMapWalls(
    {width: 1400, height: 900, walls: []},
    previous,
  ).walls, [])
})

test("world coordinates round-trip through the shared 2.5D transform", () => {
  const scene = worldToScene(320, 640, 24)
  assert.deepEqual(scene.toArray(), [320 * WORLD_SCALE, 24 * WORLD_SCALE, 640 * WORLD_SCALE])
  assert.deepEqual(sceneToWorld(scene), {x: 320, y: 640, height: 24})
})

test("hero speed config produces distinct authored run-cycle rates", () => {
  const needle = HEROES_CONFIG.find(hero => hero.name === "Needle")
  const kaze = HEROES_CONFIG.find(hero => hero.name === "Kaze")
  assert.equal(ANIMATION_REFERENCE_SPEED, 12)
  assert.equal(RUNTIME_ANIMATION_REFERENCE_SPEED, 144)
  assert.ok(kaze.speed > needle.speed)
  assert.equal(kaze.speed / ANIMATION_REFERENCE_SPEED > needle.speed / ANIMATION_REFERENCE_SPEED, true)
})

test("hero fallback configs expose compact health, damage, and speed values", () => {
  const needle = HEROES_CONFIG.find(hero => hero.name === "Needle")
  const mico = HEROES_CONFIG.find(hero => hero.name === "Wukong Mico")
  assert.deepEqual(
    {health: needle.maxLives, damage: needle.attackDamage, speed: needle.speed},
    {health: 620, damage: 65, speed: 12},
  )
  assert.deepEqual(
    {health: mico.maxLives, damage: mico.attackDamage, speed: mico.speed},
    {health: 900, damage: 85, speed: 13},
  )
})

test("hero turning follows the shortest arc through intermediate directions", () => {
  const quarterTurn = turnTowardsAngle(0, Math.PI / 2, .05)
  assert.equal(quarterTurn > 0, true)
  assert.equal(quarterTurn < Math.PI / 2, true)

  const wrappedTurn = turnTowardsAngle(Math.PI - .1, -Math.PI + .1, .05)
  assert.equal(wrappedTurn > Math.PI - .1, true)
  assert.equal(wrappedTurn < Math.PI + .1, true)
})

test("bush concealment softly fades the brawler without adding hero-bound foliage", () => {
  assert.equal(BUSH_HERO_OPACITY >= .84, true)
  assert.equal(getBushConcealmentMix(0, true, .1) > 0, true)
  assert.equal(getBushConcealmentMix(1, false, .1) < 1, true)
})

test("melee attack range stays visible as a static, full-size semicircle", () => {
  const root = new THREE.Group()
  const aim = new AimRenderer(root)
  const player = {
    aiming: true,
    x: 100,
    y: 200,
    rotation: .4,
    attackArchetype: "melee_cone",
    attackRange: 105,
    attackHalfArcDegrees: 55,
    color: "#B88CFF",
  }
  aim.update(player)
  assert.equal(aim.root.visible, true)
  assert.equal(aim.meleeArea.visible, true)
  assert.equal(aim.line.visible, false)
  assert.equal(aim.meleeArea.userData.halfArcDegrees, 55)
  assert.equal(Math.abs(aim.meleeArea.scale.x - 105 * WORLD_SCALE) < .001, true)

  const firstScale = aim.meleeArea.scale.clone()
  aim.update({...player, rotation: 2.2})
  assert.deepEqual(aim.meleeArea.scale.toArray(), firstScale.toArray())

  aim.update({
    aiming: true,
    x: 100,
    y: 200,
    rotation: .4,
    attackArchetype: "projectile",
    attackRange: 760,
    color: "#62C8FF",
  })
  assert.equal(aim.root.visible, true)
  assert.equal(aim.meleeArea.visible, false)
  assert.equal(aim.line.visible, true)
  assert.equal(aim.target.visible, true)
})

test("attack range guides hide when aiming ends", () => {
  const root = new THREE.Group()
  const aim = new AimRenderer(root)
  const base = {
    aiming: false,
    x: 100,
    y: 200,
    rotation: .4,
    attackArchetype: "melee_cone",
    attackRange: 120,
    attackHalfArcDegrees: 48,
    color: "#FFB33E",
  }
  aim.update({...base, aiming: true})
  aim.update(base)
  assert.equal(aim.root.visible, false)
})

test("screen aim mapping keeps the full world direction instead of compressing it", () => {
  const camera = new CameraRig()
  const player = {x: 512, y: 384}
  camera.resize(1000, 700)
  camera.follow(player, {width: 1024, height: 768}, 1 / 60)
  camera.camera.updateMatrixWorld(true)

  for (const angle of [0, Math.PI / 4, Math.PI / 2, Math.PI, -Math.PI / 2, -Math.PI / 4]) {
    const target = camera.worldToScreen(
      player.x + Math.cos(angle) * 100,
      player.y + Math.sin(angle) * 100,
    )
    const resolved = camera.screenToAimAngle(target.x, target.y, player)
    const error = Math.atan2(Math.sin(resolved - angle), Math.cos(resolved - angle))
    assert.ok(Math.abs(error) < .001, `angle ${angle} resolved to ${resolved}`)
  }
})

test("server bats are rendered, animated, and removed with the monster snapshot", () => {
  const root = new THREE.Group()
  const monsters = new MonsterRenderer(root)
  monsters.sync({
    bat_1: {x: 120, y: 220, radius: 24, rotation: .5, lives: 2400, maxLives: 3200, tier: 2},
  })

  const bat = monsters.views.get("bat_1")
  assert.equal(root.children.includes(monsters.root), true)
  assert.equal(bat.group.userData.kind, "bat")
  assert.equal(bat.group.userData.tier, 2)
  assert.equal(bat.healthBar.scale.x >= 2, true)
  assert.equal(bat.healthBar.scale.y >= 2, true)
  assert.deepEqual(bat.group.position.toArray(), worldToScene(120, 220, 22).toArray())
  monsters.update(.1, 1)
  assert.equal(Math.abs(bat.leftWing.rotation.z) > 0, true)

  monsters.sync({})
  assert.equal(monsters.views.size, 0)
  monsters.dispose()
})

test("a monster with zero HP is removed even before the server drops its id", () => {
  const root = new THREE.Group()
  const monsters = new MonsterRenderer(root)
  monsters.sync({
    bat_1: {x: 120, y: 220, radius: 24, lives: 100, maxLives: 100},
  })

  monsters.sync({
    bat_1: {x: 120, y: 220, radius: 24, lives: 0, maxLives: 100},
  })

  assert.equal(monsters.views.size, 0)
  assert.equal(monsters.root.children.length, 0)
  monsters.dispose()
})

test("health labels show exact remaining and maximum HP", () => {
  assert.equal(formatHealthLabel(1840, 3600), "1840 / 3600")
  assert.equal(formatHealthLabel(-20, 3600), "0 / 3600")
})

test("damage bar keeps the just-lost HP visible as a red trailing segment", () => {
  assert.deepEqual(getDamageBarFractions(0.62, 0.80), {current: 0.62, damage: 0.80})
  assert.deepEqual(getDamageBarFractions(0.62, 0.80, 0.5), {current: 0.62, damage: 0.71})
})

test("monster health drops are visible until the player collects them", () => {
  const root = new THREE.Group()
  const renderer = new PickupRenderer(root)

  renderer.sync([{x: 120, y: 220, radius: 9, type: "potion-red", active: true}])
  assert.equal(root.children.length, 1)
  assert.equal(root.children[0].userData.type, "potion-red")
  assert.deepEqual(root.children[0].position.toArray(), worldToScene(120, 220, 0).toArray())

  renderer.sync([])
  assert.equal(root.children.length, 0)
  renderer.dispose()
})

test("lunar crates and their reward colors render as distinct pickups", () => {
  const root = new THREE.Group()
  const renderer = new PickupRenderer(root)

  renderer.sync([
    {x: 120, y: 220, radius: 22, type: "lunar_crate", lootType: "speed", active: true},
    {x: 180, y: 220, radius: 16, type: "lunar_damage", lootType: "damage", active: true},
  ])

  assert.equal(root.children.length, 2)
  assert.equal(root.children[0].userData.type, "lunar_crate")
  assert.equal(root.children[0].userData.color, 0x4ea7ff)
  assert.equal(root.children[1].userData.type, "lunar_damage")
  assert.equal(root.children[1].userData.color, 0xff4e57)
  renderer.dispose()
})

test("the phase HUD no longer advertises a landing phase", async () => {
  const source = await readFile(projectFile("src/components/BattleGame/BattleGameUI.jsx"), "utf8")
  assert.doesNotMatch(source, /\blanding:\s*\{/)
  assert.match(source, /hunt:\s*\{/)
})

test("hero health badges format current/max HP and clamp the progress fraction", () => {
  assert.equal(formatHeroHealthLabel({lives: 3708, maxLives: 6700}), "3708 / 6700")
  assert.equal(getHeroHealthFraction({lives: 3350, maxLives: 6700}), .5)
  assert.equal(getHeroHealthFraction({lives: 8000, maxLives: 6700}), 1)
  assert.equal(getHeroHealthFraction({lives: -10, maxLives: 6700}), 0)
})

test("battle minimap keeps static obstacle DOM out of the moving HUD rerender", async () => {
  const source = await readFile(projectFile("src/components/BattleGame/BattleGameUI.jsx"), "utf8")
  assert.match(source, /const BattleMiniMapObstacles = memo\(/)
  assert.match(source, /<BattleMiniMapObstacles map=\{map\}\/>/)
})

test("island phase progress follows authoritative timestamps and beacon progress", () => {
  assert.equal(getIslandPhaseIndex("hunt"), 0)
  assert.equal(getIslandPhaseIndex("beacon"), 3)
  assert.equal(getIslandPhaseProgress({phase: "collapse", phaseStartedAt: 1000, phaseEndsAt: 3000}, 2000), .5)
  assert.equal(getIslandPhaseProgress({phase: "beacon", beaconProgress: .65}, 2000), .65)
})

test("collecting a health drop shows an explicit healing marker", () => {
  const root = new THREE.Group()
  const renderer = new EffectRenderer(root)
  renderer.sync([{
    id: "heal-1",
    kind: "heal",
    x: 120,
    y: 220,
    color: "#65ff9c",
    damage: 800,
    life: .5,
    maxLife: .52,
  }])

  assert.equal(root.children.length, 1)
  assert.equal(root.children[0].userData.kind, "heal")
  assert.equal(root.children[0].children.some(child => child.userData.role === "healing-cross"), true)
})

test("melee attack trails expose the full configured gameplay reach", () => {
  for (const [kind, range, arc] of [
    ["mandy_staff_swing", 70, Math.PI * .35],
    ["mico_staff_swing", 120, Math.PI * .45],
    ["kaze_cross_slash", 105, .9],
  ]) {
    const root = new THREE.Group()
    const renderer = new EffectRenderer(root)
    renderer.sync([{id: kind, kind, x: 0, y: 0, range, radius: range, arc, angle: .4, life: .3, maxLife: .4}])

    const reachMeshes = []
    root.traverse(child => {
      if (child.userData.role === "melee-reach") reachMeshes.push(child)
    })
    assert.equal(reachMeshes.length, kind === "kaze_cross_slash" ? 2 : 1)
    for (const mesh of reachMeshes) {
      const positions = mesh.geometry.attributes.position
      let outerRadius = 0
      for (let index = 0; index < positions.count; index++) {
        outerRadius = Math.max(outerRadius, Math.hypot(positions.getX(index), positions.getY(index)))
      }
      assert.ok(Math.abs(outerRadius - range * WORLD_SCALE) < .01)
    }
  }
})

test("battle WebGL setup rejects an exhausted canvas before Three.js reads null precision", () => {
  const requested = []
  const canvas = {getContext: type => {
    requested.push(type)
    return null
  }}
  assert.throws(() => getBattleWebGLContext(canvas, false), /WebGL context is unavailable/)
  assert.deepEqual(requested, ["webgl2", "webgl"])
})

test("entering battle immediately releases every hero-preview WebGL context", () => {
  let disposed = 0
  let lost = 0
  registerPreviewRenderer({
    setAnimationLoop: () => {},
    dispose: () => { disposed++ },
    forceContextLoss: () => { lost++ },
  })
  registerPreviewRenderer({
    setAnimationLoop: () => {},
    dispose: () => { disposed++ },
    forceContextLoss: () => { lost++ },
  })
  releaseAllPreviewContexts()
  assert.equal(previewRendererCount(), 0)
  assert.equal(disposed, 2)
  assert.equal(lost, 2)
})

test("queued hero-card previews receive a slot after an earlier card releases it", async () => {
  const releaseFirst = await acquirePreviewSlot(1)
  let secondStarted = false
  const secondSlot = acquirePreviewSlot(1).then(release => {
    secondStarted = true
    return release
  })

  await Promise.resolve()
  assert.equal(secondStarted, false)

  releaseFirst()
  const releaseSecond = await secondSlot
  assert.equal(secondStarted, true)
  releaseSecond()
})

test("network interpolation uses the server clock domain and smooths every moving entity", () => {
  const simulation = new NetworkSimulation({interpolationDelay: 100})
  const first = {
    type: "state",
    ts: 1000,
    players: {enemy: {x: 0, y: 10, rotation: 0}},
    monsters: {bat: {x: 20, y: 30, rotation: 0}},
    bullets: [{id: 7, x: 40, y: 50, z: 0, rotation: 0}],
  }
  const second = {
    type: "state",
    ts: 1033,
    players: {enemy: {x: 99, y: 10, rotation: .3}},
    monsters: {bat: {x: 119, y: 30, rotation: .3}},
    bullets: [{id: 7, x: 139, y: 50, z: 33, rotation: .3}],
  }
  simulation.snapshots = [first, second]
  simulation.latestState = second
  simulation.clockOffset = 5000

  const display = simulation.getDisplayState(6116.5)
  assert.equal(Math.abs(display.players.enemy.x - 49.5) < .001, true)
  assert.equal(Math.abs(display.monsters.bat.x - 69.5) < .001, true)
  assert.equal(Math.abs(display.bullets[0].x - 89.5) < .001, true)
  assert.equal(Math.abs(display.bullets[0].z - 16.5) < .001, true)
})

test("the first battle snapshot renders its map when optional entity lists are null", () => {
  const simulation = new NetworkSimulation({interpolationDelay: 0})
  const walls = [
    {minX: 0, minY: 0, maxX: 80, maxY: 240, type: "wall"},
    {minX: 160, minY: 80, maxX: 240, maxY: 160, type: "bush"},
  ]
  simulation.ingest({
    type: "state",
    ts: 1000,
    map: {width: 1024, height: 768, walls},
    players: {},
    monsters: null,
    bullets: null,
  })

  const display = simulation.getDisplayState(1000)
  assert.equal(display.map.walls, walls)
  assert.deepEqual(display.monsters, {})
  assert.deepEqual(display.bullets, [])
})

test("the battle map stays populated across full and compact server snapshots", () => {
  const received = []
  const client = new GameClient("", "", state => received.push(state))
  const walls = [
    {minX: 40, minY: 40, maxX: 120, maxY: 80, type: "wall"},
    {minX: 160, minY: 80, maxX: 240, maxY: 160, type: "bush"},
  ]
  client.handleMessage({
    type: "state",
    ts: 1000,
    map: {width: 1024, height: 768, walls},
    players: {},
    monsters: null,
    bullets: null,
  })
  client.handleMessage({
    type: "state",
    ts: 1033,
    map: {width: 1024, height: 768, walls: null},
    players: {},
    monsters: null,
    bullets: null,
  })

  const simulation = new NetworkSimulation({interpolationDelay: 0})
  received.forEach(state => simulation.ingest(state))
  const display = simulation.getDisplayState(1033)
  const root = new THREE.Group()
  const mapRenderer = new MapRenderer(root, {waterTexture: new THREE.Texture()})
  mapRenderer.sync(display.map)

  assert.equal(display.map.walls, walls)
  assert.equal(mapRenderer.objects.size, 3)
  assert.ok(root.children.length >= 3)
  mapRenderer.dispose()
})

test("local reconciliation compares a server snapshot with matching client-local history", () => {
  const simulation = new NetworkSimulation()
  simulation.playerId = "local"
  simulation.predicted = {x: 90, y: 20}
  simulation.clockOffset = 5000
  simulation.positionHistory = [
    {time: 5900, x: 50, y: 20},
    {time: 6000, x: 90, y: 20},
  ]
  simulation.latestState = {
    type: "state",
    ts: 1000,
    players: {local: {x: 90, y: 20, lives: 100, radius: 14}},
  }
  simulation.reconcile()
  assert.deepEqual(simulation.correction, {x: 0, y: 0})
})

test("mobile camera starts on the player and fits the map after rotation", () => {
  const portraitAspect = 390 / 844
  const landscapeAspect = 844 / 390
  const mapWidth = 1024
  const mapHeight = 768

  const portraitVertical = fitVerticalSpanToMap(27, portraitAspect, mapWidth, mapHeight)
  const landscapeVertical = fitVerticalSpanToMap(31, landscapeAspect, mapWidth, mapHeight)

  assert.equal(portraitVertical, 27)
  assert.ok(landscapeVertical < 31)
  assert.ok(portraitVertical / Math.sin(THREE.MathUtils.degToRad(55)) <= mapHeight * WORLD_SCALE)
  assert.ok(landscapeVertical * landscapeAspect <= mapWidth * WORLD_SCALE)

  const camera = new CameraRig()
  camera.resize(390, 844)
  camera.follow({x: 512, y: 384}, {width: mapWidth, height: mapHeight}, 1 / 60)
  assert.equal(camera.target.x, 512 * WORLD_SCALE)
  assert.equal(camera.target.z, 384 * WORLD_SCALE)
})

test("camera keeps the last hero position when the local hero dies", () => {
  const camera = new CameraRig()
  const map = {width: 1024, height: 768}

  camera.resize(390, 844)
  camera.follow({x: 180, y: 260}, map, 1 / 60)
  camera.follow(null, map, 1 / 60)

  assert.equal(camera.target.x, 180 * WORLD_SCALE)
  assert.equal(camera.target.z, 260 * WORLD_SCALE)
})

test("the hero manifest uses self-contained base GLBs", () => {
  assert.deepEqual(Object.keys(HERO_ASSETS), ["Needle", "Mandy", "Fairy Mina", "Brock Zeus", "Kaze", "Wukong Mico", "Persephone Lumi", "Katty"])
  for (const name of Object.keys(HERO_ASSETS)) {
    const asset = getHeroAsset(name)
    assert.equal(asset.id, name)
    assert.equal(asset.scale > 0, true)
    const expectedClipKeys = ["Needle", "Mandy", "Fairy Mina", "Brock Zeus", "Kaze"].includes(name)
      ? ["idle", "run", "hit", "aim", "aimSuper", "attack", "super", "gadget", "spawn", "victory", "defeat", "aimGadget"]
      : ["idle", "run", "hit", "aim", "aimSuper", "attack", "super", "gadget", "spawn", "victory", "defeat"]
    assert.deepEqual(Object.keys(asset.clips), expectedClipKeys)
    assert.equal("eventAnimations" in asset, false)
    assert.equal("weaponUrl" in asset, false)
    assert.equal("weaponAttachments" in asset, false)
    if (!asset.procedural) assert.match(asset.url, /\/assets\/heroes\/output_heroes\/[^/]+_base\.glb$/)
  }
  for (const name of Object.keys(HERO_ASSETS)) assert.equal(HERO_ASSETS[name].available, true)
  assert.equal(HERO_ASSETS.Needle.url, "/assets/heroes/output_heroes/needle_base.glb")
  assert.deepEqual(HEROES_CONFIG.map(hero => hero.name), Object.keys(HERO_ASSETS))
})

test("camera punch decays without changing the tracked gameplay target", () => {
  const camera = new CameraRig()
  const player = {x: 512, y: 384}
  const map = {width: 1024, height: 768}
  camera.resize(1000, 700)
  camera.follow(player, map, 1 / 60)
  const target = camera.target.clone()
  const basePosition = camera.camera.position.clone()
  camera.addShake(.2)
  camera.follow(player, map, 1 / 60)
  assert.ok(camera.shake > 0)
  assert.deepEqual(camera.target.toArray(), target.toArray())
  assert.notDeepEqual(camera.camera.position.toArray(), basePosition.toArray())
  for (let index = 0; index < 60; index++) camera.follow(player, map, 1 / 60)
  assert.equal(camera.shake, 0)
  assert.deepEqual(camera.target.toArray(), target.toArray())
})

test("hero asset resolution keeps canonical names and handles unknown names safely", () => {
  assert.equal(resolveHeroName("Mandy"), "Mandy")
  assert.equal(resolveHeroName("needle"), "Needle")
  assert.equal(resolveHeroName("fairy-mina"), "Fairy Mina")
  assert.equal(resolveHeroName("brock-zeus"), "Brock Zeus")
  assert.equal(resolveHeroName("wukong-mico"), "Wukong Mico")
  assert.equal(resolveHeroName("persephone-lumi"), "Persephone Lumi")
  assert.equal(resolveHeroName("katty"), "Katty")
  assert.equal(resolveHeroName("missing-hero"), "Mandy")
})

test("removed heroes have no client asset or canonical alias", () => {
  assert.equal(getHeroAsset("Damian"), null)
  assert.equal(resolveHeroName("damian"), "Mandy")
})

test("the runtime renderer has no Canvas2D engine switch or fallback", async () => {
  const source = await readFile(projectFile("src/components/BattleGame/Renderer.js"), "utf8")
  assert.doesNotMatch(source, /CanvasRenderer|battle_renderer|renderer=|getContext\(["']2d["']\)/)
})

test("entering battle never falls back to a blank screen while the arena loads", async () => {
  const appSource = await readFile(projectFile("src/App.jsx"), "utf8")
  const landingSource = await readFile(projectFile("src/pages/landing-page.jsx"), "utf8")
  const battleSource = await readFile(projectFile("src/components/BattleGame/BattleGame.jsx"), "utf8")

  assert.match(appSource, /Suspense fallback=\{<BattleLoading/)
  assert.match(landingSource, /setBattleStarting\(true\)/)
  assert.match(landingSource, /<BattleLoading/)
  assert.match(battleSource, /view === "connecting"[\s\S]*<BattleLoading/)
})

test("battle startup yields a browser paint before creating WebGL resources", async () => {
  const battleSource = await readFile(projectFile("src/components/BattleGame/BattleGame.jsx"), "utf8")

  assert.match(battleSource, /setTimeout\(startBattle, 0\)/)
  assert.match(battleSource, /startBattle[\s\S]*releaseAllPreviewContexts\(\)[\s\S]*new Renderer\(/)
})

test("battle loop feeds the time-based display state to the renderer every frame", async () => {
  const battleSource = await readFile(projectFile("src/components/BattleGame/BattleGame.jsx"), "utf8")

  assert.match(battleSource, /simulation\.advance\(delta\)/)
  assert.match(battleSource, /const displayState = simulation\.getDisplayState\(\)/)
  assert.match(battleSource, /renderer\.setState\(displayState\)/)
  assert.match(battleSource, /renderer\.setDisplayState\(displayState\)/)
})

test("snapshot UI state is sampled at the throttled cadence instead of every packet", async () => {
  const battleSource = await readFile(projectFile("src/components/BattleGame/BattleGame.jsx"), "utf8")

  assert.match(battleSource, /const shouldUpdateUi = !lastUiUpdateRef\.current[\s\S]*?if \(shouldUpdateUi\) \{[\s\S]*?simulation\.getDisplayState\(receivedAt, \{copyEntities: true\}\)/)
})

test("battle renderer does not rescan compact map wrappers every snapshot", async () => {
  const source = await readFile(projectFile("src/components/BattleGame/rendering/three/ThreeBattleRenderer.js"), "utf8")
  assert.match(source, /state\.map\?\.walls !== this\.mapState\.walls/)
  assert.doesNotMatch(source, /if \(state\.map !== this\.mapState\)/)
})

test("battle loading stays visible until the first arena frame is rendered", async () => {
  const source = await readFile(projectFile("src/components/BattleGame/BattleGame.jsx"), "utf8")
  const rendererSource = await readFile(projectFile("src/components/BattleGame/rendering/three/ThreeBattleRenderer.js"), "utf8")

  assert.match(source, /const \[sceneReady, setSceneReady\] = useState\(false\)/)
  assert.match(source, /!sceneReady \|\| view === "connecting"/)
  assert.match(source, /setSceneReady\(renderer\.isReady\(\)\)/)
  assert.match(rendererSource, /isReady\(\)/)
  assert.match(rendererSource, /this\.players\.size > 0/)
  assert.match(rendererSource, /view\.isReady\(\)/)
})

test("battle hero is not exposed or selected through query parameters", async () => {
  const appSource = await readFile(projectFile("src/App.jsx"), "utf8")
  const landingSource = await readFile(projectFile("src/pages/landing-page.jsx"), "utf8")
  const battleSource = await readFile(projectFile("src/components/BattleGame/BattleGame.jsx"), "utf8")

  assert.doesNotMatch(appSource, /searchParams\.get\(["']hero["']\)/)
  assert.doesNotMatch(landingSource, /\/battle\?hero|hero=\$\{/)
  assert.doesNotMatch(battleSource, /heroQuery|\/battle\/\$\{[^}]+\}\?hero/)
})

test("the battle renderer boundary forwards the final outcome animation", async () => {
  const source = await readFile(projectFile("src/components/BattleGame/Renderer.js"), "utf8")
  assert.match(source, /setOutcome\(outcome\)\s*\{\s*return this\.impl\.setOutcome\(outcome\)\s*\}/)
})

test("zero health authoritatively opens a defeat result even if you_died is missing", () => {
  const now = 1_000_000
  const state = {
    game: {},
    players: {
      local: {lives: 0, kills: 3, monsterKills: 2},
      alive: {lives: 1200},
      defeated: {lives: 0},
    },
  }
  assert.deepEqual(getStateBattleResult(state, "local", "game"), {
    won: false,
    place: 2,
    kills: 3,
    monsters: 2,
    duration: 0,
  })
  assert.deepEqual(getPlayerBattleStats({...state, game: {gameEndsAt: now + 257_500}}, "local", now), {
    place: 2,
    kills: 3,
    monsters: 2,
    duration: 43,
  })
  assert.equal(getStateBattleResult(state, "local", "result"), null)
  assert.equal(getStateBattleResult(state, "missing", "game"), null)
})

test("a death message cannot award first place from a stale alive snapshot", () => {
  const state = {
    game: {alivePlayers: 2},
    players: {
      local: {lives: 1200},
      alive: {lives: 1200},
    },
  }

  assert.equal(
    getPlayerBattleStats(state, "local", Date.now(), {eliminated: true}).place,
    2,
  )
})

test("a lethal authoritative snapshot waits for the presentation frame before opening results", () => {
  const authoritative = {
    game: {state: "game"},
    players: {
      local: {lives: 0},
      alive: {lives: 1200},
    },
  }
  const presentation = {
    game: {state: "game"},
    players: {
      local: {lives: 1200},
      alive: {lives: 1200},
    },
  }

  assert.equal(getPresentedBattleResult(authoritative, presentation, "local", "game"), null)
  assert.deepEqual(getPresentedBattleResult(authoritative, authoritative, "local", "game"), {
    won: false,
    place: 2,
    kills: 0,
    monsters: 0,
    duration: 0,
  })
})

test("battle outcome checks the rendered presentation state before covering the arena", async () => {
  const source = await readFile(projectFile("src/components/BattleGame/BattleGame.jsx"), "utf8")
  assert.match(source, /getPresentedBattleResult\(/)
})

test("a post-death game snapshot cannot replace the defeat result view", () => {
  assert.equal(getSynchronizedBattleView("game", "dead"), null)
  assert.equal(getSynchronizedBattleView("game", "result"), null)
  assert.equal(getSynchronizedBattleView("game", "timeout"), null)
  assert.equal(getSynchronizedBattleView("game", "lobby"), "game")
  assert.equal(getSynchronizedBattleView("lobby", "game"), "lobby")
})

test("dead heroes are excluded from the rendered player scene", () => {
  assert.equal(isAlivePlayerState({lives: 1200}), true)
  assert.equal(isAlivePlayerState({lives: 0}), false)
  assert.equal(isAlivePlayerState({lives: -1}), false)
})

test("renderer keeps an existing hero view long enough to show its death pose", async () => {
  const source = await readFile(projectFile("src/components/BattleGame/rendering/three/ThreeBattleRenderer.js"), "utf8")
  assert.match(source, /const existingView = this\.players\.get\(String\(id\)\)/)
  assert.match(source, /if \(!isAlivePlayerState\(player\) && !existingView\) return/)
  assert.match(source, /active\.add\(String\(id\)\)/)
})

test("interpolated lethal frames trigger the existing view death transition", async () => {
  const source = await readFile(projectFile("src/components/BattleGame/rendering/three/ThreeBattleRenderer.js"), "utf8")
  assert.match(source, /if \(!isAlivePlayerState\(player\)\) \{[\s\S]*?view\.setState\(player, Boolean\(state\.networkSmoothed\)\)/)
})

test("the in-battle counter uses the authoritative total when hidden heroes are absent", () => {
  const state = {
    game: {alivePlayers: 4},
    players: {
      local: {lives: 1200},
    },
  }

  assert.equal(getBattlePlayerCount(state), 4)
})

test("battle reward message names the rewarded placement", () => {
  assert.equal(
    getBattleRewardMessage({won: true, place: 1}),
    "Вы получили награду за №1 место в бою",
  )
  assert.equal(getBattleRewardMessage({won: false, place: 2}), "")
})

test("battle result stats keep their Cyrillic labels readable", async () => {
  const source = await readFile(projectFile("src/components/BattleGame/BattleGameUI.jsx"), "utf8")
  assert.match(source, /result\.won \? 1 : "—"/)
  assert.match(source, /<\/b>место<\/span>/)
  assert.match(source, /<\/b>бойцов<\/span>/)
  assert.match(source, /<\/b>мобов<\/span>/)
  assert.match(source, /<\/b>время<\/span>/)
  assert.doesNotMatch(source, /РјРµСЃС‚Рѕ|Р±РѕР№С†РѕРІ|РјРѕР±РѕРІ|РІСЂРµРјСЏ/)
})

test("the result popup is committed before an optional renderer outcome animation", async () => {
  const source = await readFile(projectFile("src/components/BattleGame/BattleGame.jsx"), "utf8")
  const finishBattle = source.slice(source.indexOf("const finishBattle"), source.indexOf("const debugPlayerId"))
  assert.equal(finishBattle.indexOf("setBattleResult(normalized)") < finishBattle.indexOf("setOutcome("), true)
  assert.match(finishBattle, /try\s*\{[\s\S]*setOutcome/)
})

test("the battle scene keeps PBR lighting without a camera-following shadow pool", async () => {
  const source = await readFile(projectFile("src/components/BattleGame/rendering/SceneRoot.js"), "utf8")
  assert.match(source, /HemisphereLight/)
  assert.match(source, /DirectionalLight/)
  assert.match(source, /shadowMap\.enabled = false/)
  assert.match(source, /keyLight\.castShadow = false/)
  assert.doesNotMatch(source, /lightFocus|getWorldDirection/)
})

test("battle renderer keeps the full-quality path throughout combat", async () => {
  const source = await readFile(projectFile("src/components/BattleGame/rendering/three/ThreeBattleRenderer.js"), "utf8")

  assert.match(source, /new SceneRoot\(canvas\)/)
  assert.doesNotMatch(source, /Quality|quality|detectLowQualityDevice|slowFrameCount|enableLowQuality/)
  assert.match(source, /new MapRenderer\(this\.mapRoot\)/)
})

test("battle keeps authored hero assets on the single visual path", async () => {
  const heroSource = await readFile(projectFile("src/components/BattleGame/rendering/heroes/HeroView.js"), "utf8")
  const mapSource = await readFile(projectFile("src/components/BattleGame/rendering/map/MapRenderer.js"), "utf8")
  const sceneSource = await readFile(projectFile("src/components/BattleGame/rendering/SceneRoot.js"), "utf8")
  const rendererSource = await readFile(projectFile("src/components/BattleGame/rendering/three/ThreeBattleRenderer.js"), "utf8")
  assert.doesNotMatch(heroSource, /async loadGlb\(/)
  assert.doesNotMatch(rendererSource, /Quality|quality|enableLowQuality|setLowQuality/)
  assert.match(heroSource, /const updateLabel = \(sprite, state\) => \{\s*if \(!sprite\) return/)
  assert.match(mapSource, /createProp\(wall, index, this\.waterTexture\)/)
  assert.match(sceneSource, /antialias: true/)
  assert.match(sceneSource, /shadowMap\.enabled = false/)
  assert.doesNotMatch(sceneSource, /Quality|quality|softwareWebGL/)
  assert.doesNotMatch(heroSource, /HeroModelFactory|createHeroModel/)
})

test("battle keeps authored GLB heroes and procedural environment enabled", async () => {
  const heroSource = await readFile(projectFile("src/components/BattleGame/rendering/heroes/HeroView.js"), "utf8")
  const mapSource = await readFile(projectFile("src/components/BattleGame/rendering/map/MapRenderer.js"), "utf8")

  assert.match(heroSource, /const readyInstance = assetRegistry\.instantiateReadyHero\(state\.hero\)/)
  assert.match(heroSource, /if \(readyInstance\) this\.installGlbInstance\(readyInstance, state\.hero\)/)
  assert.doesNotMatch(mapSource, /assetRegistry\.instantiate(?:Ready)?Environment/)
  assert.doesNotMatch(mapSource, /upgradeToEnvironment/)
  assert.doesNotMatch(mapSource, /Quality|quality|InstancedMesh/)
})

test("authored hero parts merge without breaking shared skeleton skinning", () => {
  const root = new THREE.Group()
  const rig = new THREE.Group()
  const bone = new THREE.Bone()
  bone.name = "Root"
  rig.add(bone)
  root.add(rig)
  const skeleton = new THREE.Skeleton([bone])
  const material = new THREE.MeshStandardMaterial({color: 0x55c889})
  const makeGeometry = () => {
    const geometry = new THREE.BoxGeometry(.2, .2, .2)
    const count = geometry.attributes.position.count
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Array(count * 4).fill(0), 4))
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(
      Array.from({length: count * 4}, (_, index) => index % 4 === 0 ? 1 : 0),
      4,
    ))
    return geometry
  }
  const first = new THREE.SkinnedMesh(makeGeometry(), material.clone())
  const second = new THREE.SkinnedMesh(makeGeometry(), material.clone())
  first.bind(skeleton)
  second.bind(skeleton)
  rig.add(first, second)

  const result = mergeHeroRenderParts(root)

  assert.equal(result.before, 2)
  assert.equal(result.after, 1)
  assert.equal(result.mergedGroups, 1)
  const merged = rig.children.find(child => child.isSkinnedMesh)
  assert.ok(merged)
  assert.equal(merged.skeleton.bones[0], bone)
  assert.equal(merged.geometry.attributes.skinIndex.count, first.geometry.attributes.skinIndex.count * 2)
  merged.geometry.dispose()
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

test("GLB heroes keep only their compact contact shadow", async () => {
  const template = new THREE.Group()
  template.add(new THREE.Mesh(
    new THREE.BoxGeometry(1, 2, 1),
    new THREE.MeshStandardMaterial(),
  ))
  const registry = new AssetRegistry({
    manifest: {
      TestHero: {
        id: "TestHero",
        url: "/test.glb",
        available: true,
        scale: 1,
        rotationOffset: 0,
        clips: {},
      },
    },
    load: async () => ({scene: template, animations: []}),
  })

  const instance = await registry.instantiateHero("TestHero")
  const heroMesh = instance.root.children.find(child => child.isMesh)

  assert.ok(heroMesh)
  assert.equal(heroMesh.castShadow, false)
  instance.root.traverse(node => {
    node.geometry?.dispose?.()
    node.material?.dispose?.()
  })
})

test("AssetRegistry keeps embedded weapon geometry and loads only the hero GLB", async () => {
  const heroScene = new THREE.Group()
  const hand = new THREE.Bone()
  hand.name = "L_wrist_s"
  const socket = new THREE.Bone()
  socket.name = "weapon_socket_l"
  hand.add(socket)
  const weapon = new THREE.Group()
  weapon.name = "HeroAttachment_TestWeapon"
  weapon.userData.attachmentRole = "held-weapon"
  socket.add(weapon)
  heroScene.add(hand)

  const loads = []
  const registry = new AssetRegistry({
    manifest: {
      TestHero: {
        id: "TestHero",
        url: "/test_base.glb",
        // Stale fields must not re-enable the detached runtime path.
        weaponUrl: "/test_weapon.glb",
        weaponAttachments: [{
          name: "HeroAttachment_TestWeapon",
          target: "weapon_socket_l",
          role: "held-weapon",
        }],
        available: true,
        scale: 1,
        rotationOffset: 0,
        clips: {},
      },
    },
    load: async url => {
      loads.push(url)
      return {scene: heroScene, animations: []}
    },
  })

  const instance = await registry.instantiateHero("TestHero")
  const embeddedWeapon = instance.root.getObjectByName("HeroAttachment_TestWeapon")
  assert.deepEqual(loads, ["/test_base.glb"])
  assert.equal(embeddedWeapon.parent.name, "weapon_socket_l")
  assert.equal(instance.root.getObjectByName("DetachedHeroWeapon.HeroAttachment_TestWeapon") ?? null, null)
})

test("AssetRegistry uses every embedded clip from the canonical hero GLB", async () => {
  const loads = []
  const template = new THREE.Group()
  const registry = new AssetRegistry({
    manifest: {
      TestHero: {
        id: "TestHero",
        url: "/test.glb",
        available: true,
        scale: 1,
        rotationOffset: 0,
        clips: {idle: "Idle", attack: "Attack", spawn: "Spawn"},
      },
    },
    load: async url => {
      loads.push(url)
      return {
        scene: template,
        animations: [
          new THREE.AnimationClip("Idle", 1, []),
          new THREE.AnimationClip("Attack", .6, []),
          new THREE.AnimationClip("Spawn", 1.2, []),
        ],
      }
    },
  })

  const [first, second] = await Promise.all([
    registry.instantiateHero("TestHero"),
    registry.instantiateHero("TestHero"),
  ])

  assert.deepEqual(loads, ["/test.glb"])
  assert.deepEqual(first.animations.map(clip => clip.name), ["Idle", "Attack", "Spawn"])
  assert.deepEqual(second.animations.map(clip => clip.name), ["Idle", "Attack", "Spawn"])
})

test("AssetRegistry warms hero GLBs once and reports which previews are ready", async () => {
  let loads = 0
  const template = new THREE.Group()
  const registry = new AssetRegistry({
    manifest: {
      Alpha: {id: "Alpha", url: "/alpha.glb", available: true, scale: 1, rotationOffset: 0, clips: {}},
      Beta: {id: "Beta", url: "/beta.glb", available: true, scale: 1, rotationOffset: 0, clips: {}},
    },
    load: async () => {
      loads++
      return {scene: template, animations: []}
    },
  })

  assert.equal(registry.isHeroReady("Alpha"), false)
  await registry.preloadHeroes(["Alpha", "Beta", "Alpha"])
  assert.equal(loads, 2)
  assert.equal(registry.isHeroReady("Alpha"), true)
  assert.equal(registry.isHeroReady("Beta"), true)
  await registry.instantiateHero("Alpha")
  assert.equal(loads, 2)
})

test("AssetRegistry preloads only the canonical hero GLB through the shared cache", async () => {
  const loads = []
  const template = new THREE.Group()
  const registry = new AssetRegistry({
    manifest: {
      Alpha: {
        id: "Alpha",
        url: "/alpha.glb",
        available: true,
        scale: 1,
        rotationOffset: 0,
        clips: {},
      },
    },
    load: async url => {
      loads.push(url)
      return {
        scene: template,
        animations: [new THREE.AnimationClip("Idle", 1, [])],
      }
    },
  })

  await registry.preloadAll(2)
  await registry.instantiateHero("Alpha")

  assert.deepEqual(loads, ["/alpha.glb"])
})

test("AssetRegistry preloads battle heroes and companions through the shared cache", async () => {
  const loads = []
  const template = new THREE.Group()
  const registry = new AssetRegistry({
    manifest: {
      Alpha: {
        id: "Alpha",
        url: "/alpha.glb",
        companionUrl: "/alpha-cloud.glb",
        available: true,
        scale: 1,
        rotationOffset: 0,
        clips: {},
      },
    },
    load: async url => {
      loads.push(url)
      return {scene: template, animations: []}
    },
  })

  await registry.preloadBattleAssets(2)

  assert.deepEqual(loads.sort(), ["/alpha-cloud.glb", "/alpha.glb"])
  assert.equal(registry.isHeroReady("Alpha"), true)
  assert.equal(registry.areBattleAssetsReady(), true)
  assert.ok(registry.instantiateReadyHero("Alpha"))
})

test("the app does not preload battle GLBs outside the battle flow", async () => {
  const source = await readFile(projectFile("src/main.jsx"), "utf8")
  assert.doesNotMatch(source, /preloadBattleAssets/)
})

test("battle startup waits for the shared GLB cache before creating WebGL resources", async () => {
  const source = await readFile(projectFile("src/components/BattleGame/BattleGame.jsx"), "utf8")
  assert.match(source, /await assetRegistry\.preloadBattleAssets\(/)
})

test("battle heroes use the ready authored GLB before entering combat", async () => {
  const source = await readFile(projectFile("src/components/BattleGame/rendering/heroes/HeroView.js"), "utf8")
  assert.match(source, /const readyInstance = assetRegistry\.instantiateReadyHero\(state\.hero\)/)
  assert.match(source, /this\.model = readyInstance \? readyInstance\.root : new THREE\.Group\(\)/)
  assert.match(source, /if \(readyInstance\) this\.installGlbInstance\(readyInstance, state\.hero\)/)
  assert.doesNotMatch(source, /loadGlb\(/)
  const constructorSource = source.slice(source.indexOf("constructor(id"), source.indexOf("isReady()"))
  assert.match(constructorSource, /instantiateReadyHero/)
})

test("hero GLBs are normalized to one visual height instead of relying on authoring units", () => {
  const root = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 5, 1), new THREE.MeshBasicMaterial())
  body.position.set(1.75, 2.5, -.8)
  const cloud = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100), new THREE.MeshBasicMaterial())
  cloud.position.set(60, 60, 0)
  cloud.userData.attachment_role = "attack-cloud"
  const reachWeapon = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 12), new THREE.MeshBasicMaterial())
  reachWeapon.position.z = 6
  reachWeapon.userData.attachment_role = "held-weapon"
  root.add(body, cloud, reachWeapon)

  normalizeHeroHeight(root, 2.45)

  const bounds = new THREE.Box3().setFromObject(body)
  const center = bounds.getCenter(new THREE.Vector3())
  assert.equal(Math.abs((bounds.max.y - bounds.min.y) - 2.45) < 0.001, true)
  assert.equal(Math.abs(bounds.min.y) < 0.001, true)
  assert.equal(Math.abs(center.x) < 0.001, true)
  assert.equal(Math.abs(center.z) < 0.001, true)
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
  assert.equal(controller.actions.get("attack").getClip().tracks.length, 3)
  assert.equal(controller.actions.get("attack").getClip().tracks.some(track => /Hips/.test(track.name)), true)
  assert.equal(controller.actions.get("attack").getClip().tracks.some(track => /Foot/.test(track.name)), true)
  assert.equal(controller.overlay, "attack")
  assert.equal(controller.heldProjectile.parent, hand)
  assert.equal(controller.heldProjectile.visible, true)
  assert.equal(controller.actions.get("aim").isRunning(), true)
  assert.equal(controller.aimWeight > 0, true)
  assert.equal(controller.actions.get("idle").getEffectiveWeight() < 1, true)
  controller.update(.25, {moving: true, aiming: true, speed: 300, referenceSpeed: 240, attackPulse: 1})
  assert.equal(controller.heldProjectile.visible, false)
  controller.update(.3, {moving: false, aiming: false, speed: 0, referenceSpeed: 240, attackPulse: 1})
  assert.equal(controller.heldProjectile.visible, true)
  controller.dispose()

  const weightedController = new GLBHeroController(root, clips, {attack: "Attack"}, {
    heroName: "Mandy",
    spawnOnLoad: false,
  })
  const weightedTracks = weightedController.actions.get("attack").getClip().tracks.map(track => track.name)
  assert.equal(weightedTracks.includes("Hips.quaternion"), true)
  assert.equal(weightedTracks.includes("RightArm.quaternion"), true)
  assert.equal(weightedTracks.includes("RightFoot.quaternion"), true)
  weightedController.dispose()
})

test("procedural run gait never accumulates full rotations on untracked leg bones", () => {
  const root = new THREE.Group()
  const hips = new THREE.Bone()
  hips.name = "Hips"
  const leftLeg = new THREE.Bone()
  leftLeg.name = "LeftUpperLeg"
  const leftCalf = new THREE.Bone()
  leftCalf.name = "LeftLowerLeg"
  const leftFoot = new THREE.Bone()
  leftFoot.name = "LeftFoot"
  hips.add(leftLeg)
  leftLeg.add(leftCalf)
  leftCalf.add(leftFoot)
  root.add(hips)
  const run = new THREE.AnimationClip("run", 1, [
    new THREE.QuaternionKeyframeTrack("Hips.quaternion", [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
  ])
  const controller = new GLBHeroController(root, [run], {run: "run"}, {spawnOnLoad: false})
  let maximumAngle = 0
  for (let frame = 0; frame < 180; frame += 1) {
    controller.update(1 / 60, {alive: true, moving: true, speed: 300, referenceSpeed: 300})
    maximumAngle = Math.max(maximumAngle, leftLeg.quaternion.angleTo(new THREE.Quaternion()))
  }
  assert.ok(maximumAngle < .8, `leg accumulated ${maximumAngle.toFixed(3)} radians`)
  controller.dispose()
})

test("authored run disables procedural leg gait while missing overlays fall back safely", () => {
  const root = new THREE.Group()
  const hips = new THREE.Bone(); hips.name = "Hips"
  const leg = new THREE.Bone(); leg.name = "LeftLeg"
  const foot = new THREE.Bone(); foot.name = "LeftFoot"
  hips.add(leg); leg.add(foot); root.add(hips)
  const authoredRun = new THREE.AnimationClip("Run", 1, [
    new THREE.QuaternionKeyframeTrack("LeftLeg.quaternion", [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
  ])
  const controller = new GLBHeroController(root, [authoredRun], {run: "Run"}, {spawnOnLoad: false, heroName: "Mandy"})
  controller.update(.2, {moving: true, speed: 300, referenceSpeed: 300})
  assert.equal(controller.proceduralRunFallback, false)
  assert.equal(controller.playSafe("super"), false)
  assert.equal(controller.fallbackEvents.at(-1).fallback, "idle")
  controller.dispose()
})

test("hit flash updates cached hero materials without traversing the GLB every frame", () => {
  const root = new THREE.Group()
  const material = new THREE.MeshStandardMaterial({color: 0xffffff, emissive: 0x101010})
  root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material))
  const controller = new GLBHeroController(root, [], {}, {spawnOnLoad: false})
  root.traverse = () => {
    throw new Error("per-frame GLB traversal")
  }

  controller.setHitFlash(.5)

  assert.ok(material.emissive.r > new THREE.Color(0x101010).r)
  controller.dispose()
})

test("ranged heroes visibly carry their held projectile before attacking", () => {
  const root = new THREE.Group()
  const hand = new THREE.Bone()
  hand.name = "RightHand"
  root.add(hand)
  const idle = new THREE.AnimationClip("Idle", 1, [])
  const attack = new THREE.AnimationClip("Attack", .5, [])
  const controller = new GLBHeroController(root, [idle, attack], {
    idle: "Idle",
    attack: "Attack",
  }, {
    heroName: "Needle",
    attackPulse: 0,
    spawnOnLoad: false,
  })

  controller.update(.016, {alive: true, moving: false, attackPulse: 0})

  assert.equal(controller.heldProjectile.parent, hand)
  assert.equal(controller.heldProjectile.visible, true)
  controller.dispose()
})

test("GLBHeroController keeps a dead model visible for its authored death pose and restores spawn", () => {
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
  assert.equal(root.visible, true)
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

test("hero selection keeps roster previews live for their idle animation", async () => {
  const source = await readFile(projectFile("src/components/HeroSelect/HeroModelPreview.jsx"), "utf8")
  assert.match(source, /key=\{hero\?\.name\}/)
  assert.match(source, /MAX_CARD_PREVIEW_RENDERERS/)
  assert.match(source, /try \{\s*renderer\s*=\s*new THREE\.WebGLRenderer/)
  assert.match(source, /unregisterPreviewRenderer\(renderer\)/)
  assert.match(source, /if\s*\(disposed\s*\|\|[^)]*renderer\.getContext\(\)\?\.isContextLost\(\)\)\s*return/)
  assert.match(source, /renderer\.forceContextLoss\(\)/)
  assert.match(source, /acquirePreviewSlot/)
  assert.match(source, /animation\?\.update\(delta, \{alive: true, moving: false\}\)/)
  assert.doesNotMatch(source, /canvas\.toDataURL/)
  assert.doesNotMatch(source, /createHeroModel/)
  assert.match(source, /hero-model-preview--loading/)
})

test("mobile roster cards anchor scaled hero previews above their footer", async () => {
  const css = await readFile(new URL("../src/components/HeroSelect/HeroSelect.css", import.meta.url), "utf8")
  assert.match(css, /\.hero-card \.hero-portrait:has\(\.hero-model-canvas\)[^{]*\{[^}]*transform-origin:50% 0/)
  assert.match(css, /@media \(max-width:430px\)[^{]*\{[^{}]*\.hero-card \.hero-portrait:has\(\.hero-model-canvas\)[^{]*\{[^}]*scale\(\.58\)/)
})

test("authored skeletal attacks are not distorted by a second procedural bone pose", () => {
  const root = new THREE.Group()
  const spine = new THREE.Bone()
  spine.name = "Spine"
  const leftArm = new THREE.Bone()
  leftArm.name = "LeftArm"
  const rightArm = new THREE.Bone()
  rightArm.name = "RightArm"
  spine.add(leftArm, rightArm)
  root.add(spine)
  const attack = new THREE.AnimationClip("Attack", .6, [
    new THREE.QuaternionKeyframeTrack("LeftArm.quaternion", [0, .6], [0, 0, 0, 1, .2, 0, 0, .98]),
    new THREE.QuaternionKeyframeTrack("RightArm.quaternion", [0, .6], [0, 0, 0, 1, -.2, 0, 0, .98]),
  ])

  const controller = new GLBHeroController(root, [attack], {attack: "Attack"}, {
    heroName: "Mandy",
    spawnOnLoad: false,
  })

  assert.equal(controller.attackPoseNodes.length, 0)
  controller.dispose()
})

test("a completed attack releases its final pose back to locomotion", () => {
  const root = new THREE.Group()
  const spine = new THREE.Bone()
  spine.name = "Spine"
  root.add(spine)
  const idle = new THREE.AnimationClip("Idle", 1, [
    new THREE.QuaternionKeyframeTrack("Spine.quaternion", [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
  ])
  const attack = new THREE.AnimationClip("Attack", .4, [
    new THREE.QuaternionKeyframeTrack("Spine.quaternion", [0, .4], [0, 0, 0, 1, .5, 0, 0, .866]),
  ])
  const controller = new GLBHeroController(root, [idle, attack], {idle: "Idle", attack: "Attack"}, {
    heroName: "Mandy",
    attackPulse: 0,
    spawnOnLoad: false,
  })

  controller.update(.01, {alive: true, attackPulse: 1})
  controller.update(.45, {alive: true, attackPulse: 1})
  controller.update(.2, {alive: true, attackPulse: 1})

  assert.equal(controller.overlay, null)
  assert.ok(spine.quaternion.angleTo(new THREE.Quaternion()) < .05)
  controller.dispose()
})

test("the fighter selection warms only the selected GLB while idle", async () => {
  const source = await readFile(projectFile("src/components/HeroSelect/HeroSelect.jsx"), "utf8")
  assert.match(source, /assetRegistry\.preloadHeroes/)
  assert.match(source, /requestIdleCallback/)
  assert.doesNotMatch(source, /\.\.\.heroes\.map\(hero => hero\.name\)/)
})

test("hero equipment profiles hide detached ammo, keep Mina unarmed, and animate Brock's nearby cloud", () => {
  const mandyRoot = new THREE.Group()
  const mandyWrist = new THREE.Bone()
  mandyWrist.name = "L_wrist_s_047"
  const mandyStaff = new THREE.Group()
  mandyStaff.name = "MandyStaff_Attachment"
  mandyStaff.userData.attachment_role = "held-weapon"
  mandyWrist.add(mandyStaff)
  mandyRoot.add(mandyWrist)
  const mandy = new GLBHeroController(mandyRoot, [], {}, {heroName: "Mandy", spawnOnLoad: false})
  assert.equal(mandy.meleeWeapon, mandyStaff)
  mandyStaff.visible = false
  mandy.update(.016, {alive: true})
  assert.equal(mandyStaff.visible, true)
  mandy.dispose()

  const minaRoot = new THREE.Group()
  const waterball = new THREE.Mesh(new THREE.SphereGeometry(.2), new THREE.MeshBasicMaterial())
  waterball.name = "waterball_GEO_hide_ingame"
  const minaWrist = new THREE.Bone()
  minaWrist.name = "R_wrist_s_064"
  minaRoot.add(waterball, minaWrist)
  const mina = new GLBHeroController(minaRoot, [], {}, {heroName: "Fairy Mina", spawnOnLoad: false})
  assert.equal(waterball.visible, false)
  assert.equal(mina.heldProjectile, null)
  mina.dispose()

  const brockRoot = new THREE.Group()
  const cloud = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())
  cloud.name = "HeroAttachment_Cloud"
  cloud.position.set(.8, 1.4, -.15)
  const brockArmor = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshBasicMaterial())
  brockArmor.name = "armor_GEO"
  brockRoot.add(cloud, brockArmor)
  const armorRestRotation = brockArmor.quaternion.clone()
  const brockAttack = new THREE.AnimationClip("Attack", .42, [])
  const brock = new GLBHeroController(brockRoot, [brockAttack], {attack: "Attack"}, {
    heroName: "Brock Zeus",
    attackPulse: 0,
    spawnOnLoad: false,
  })
  const cloudBounds = new THREE.Box3().setFromObject(cloud)
  const cloudCenter = cloudBounds.getCenter(new THREE.Vector3())
  assert.equal(Math.abs(Math.max(...cloudBounds.getSize(new THREE.Vector3()).toArray()) - .64) < .001, true)
  assert.equal(cloudCenter.distanceTo(new THREE.Vector3(.90, 1.82, -.10)) < .001, true)
  brock.update(.22, {alive: true, attackPulse: 1})
  brock.update(.001, {alive: true, attackPulse: 1})
  assert.equal(cloud.visible, true)
  assert.equal(cloud.position.distanceTo(new THREE.Vector3(.8, 1.4, -.15)) > 0, true)
  assert.equal(cloud.userData.lightningCharge > 0, true)
  assert.equal(brock.cloudLightning.visible, true)
  assert.equal(brockArmor.quaternion.angleTo(armorRestRotation) > 0, true)
  brock.dispose()
})

test("Brock's legacy named cloud is excluded from hero height normalization", () => {
  const root = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshBasicMaterial())
  body.position.y = 1
  const cloud = new THREE.Mesh(new THREE.BoxGeometry(8, 20, 8), new THREE.MeshBasicMaterial())
  cloud.name = "HeroAttachment_Cloud"
  cloud.position.set(8, 10, 0)
  root.add(body, cloud)

  normalizeHeroHeight(root, 2.45)

  const bodyHeight = new THREE.Box3().setFromObject(body).getSize(new THREE.Vector3()).y
  assert.ok(Math.abs(bodyHeight - 2.45) < .001)
  assert.equal(cloud.userData.attachmentRole, "attack-cloud")
})

test("canonical weapon sockets and held-weapon roles replace hero-specific attachment guesses", () => {
  const root = new THREE.Group()
  const wrist = new THREE.Bone()
  wrist.name = "R_wrist_s"
  const socket = new THREE.Group()
  socket.name = "Socket.Weapon.R"
  wrist.add(socket)
  root.add(wrist)
  const weapon = new THREE.Group()
  weapon.name = "HeroWeapon"
  weapon.userData.attachment_role = "held-weapon"
  socket.add(weapon)

  const controller = new GLBHeroController(root, [], {}, {
    heroName: "Persephone Lumi",
    spawnOnLoad: false,
  })

  assert.equal(controller.rig.rightHand, socket)
  assert.equal(controller.meleeWeapon, weapon)
  controller.dispose()
})

test("Wukong ignores cloud-like meshes because the companion was removed", () => {
  const root = new THREE.Group()
  const costumeCloud = new THREE.Mesh(new THREE.SphereGeometry(.2), new THREE.MeshBasicMaterial())
  costumeCloud.name = "HeroAttachment_WukongCloud"
  costumeCloud.userData.attachment_role = "companion-cloud"
  root.add(costumeCloud)

  const controller = new GLBHeroController(root, [], {}, {
    heroName: "Wukong Mico",
    spawnOnLoad: false,
  })

  assert.equal(controller.cloud, null)
  assert.equal(controller.cloudLightning, null)
  controller.dispose()
})

test("new hero projectiles match the detached object used by the attack", () => {
  const mina = createProjectileVisual({kind: "mina_star_fan"})
  assert.equal(mina.userData.vfxType, "fairy-orb")
})

test("short-lived projectiles use emissive visuals without dynamic scene lights", () => {
  for (const kind of ["spore", "zeus_lightning", "mina_star_fan"]) {
    const visual = createProjectileVisual({kind, radius: 15})
    assert.equal(visual.getObjectByProperty("isLight", true), undefined, `${kind} adds a dynamic light`)
  }
})

test("Needle spore attacks use a layered 3D projectile instead of a primitive ball", () => {
  const visual = createProjectileVisual({kind: "spore", radius: 15, color: "#75D947"})
  assert.equal(visual.isGroup, true)
  assert.equal(visual.name, "NeedleSporeProjectile")
  assert.equal(visual.children.filter(child => child.userData.role === "petal").length, 6)
  assert.equal(visual.children.filter(child => child.userData.role === "thorn").length >= 12, true)
  assert.equal(visual.userData.vfxType, "needle-spore")
})

test("high-quality stone props use the shared faceted block silhouette", () => {
  const prop = createProp(
    {minX: 20, minY: 20, maxX: 60, maxY: 60, type: "wall"},
    0,
    new THREE.Texture(),
  )
  const block = prop.children.find(child => child.geometry?.userData?.stylizedStoneBlock)
  assert.ok(block)
  assert.equal(block.geometry.userData.stoneFacets, true)
  assert.equal(block.material.vertexColors, true)
  prop.traverse(node => {
    if (node.geometry) node.geometry.dispose()
    if (node.material) node.material.dispose()
  })
})

test("stone props use subtle deterministic color variation without changing their footprint", () => {
  const first = createProp(
    {minX: 20, minY: 20, maxX: 60, maxY: 60, type: "wall"},
    0,
    new THREE.Texture(),
  )
  const second = createProp(
    {minX: 60, minY: 20, maxX: 100, maxY: 60, type: "wall"},
    1,
    new THREE.Texture(),
  )
  const firstBlock = first.children.find(child => child.geometry?.userData?.stylizedStoneBlock)
  const secondBlock = second.children.find(child => child.geometry?.userData?.stylizedStoneBlock)

  assert.notEqual(firstBlock.material.color.getHex(), secondBlock.material.color.getHex())
  firstBlock.geometry.computeBoundingBox()
  secondBlock.geometry.computeBoundingBox()
  assert.deepEqual(
    firstBlock.geometry.boundingBox.getSize(new THREE.Vector3()).toArray(),
    secondBlock.geometry.boundingBox.getSize(new THREE.Vector3()).toArray(),
  )

  for (const prop of [first, second]) {
    prop.traverse(node => {
      if (node.geometry) node.geometry.dispose()
      if (node.material) node.material.dispose()
    })
  }
})

test("adjacent stone cells stay fixed-size and form a continuous wall", () => {
  const root = new THREE.Group()
  const mapRenderer = new MapRenderer(root, {waterTexture: new THREE.Texture()})

  mapRenderer.sync({
    width: 160,
    height: 120,
    tileSize: 40,
    walls: [
      {minX: 20, minY: 20, maxX: 60, maxY: 60, type: "wall"},
      {minX: 60, minY: 20, maxX: 100, maxY: 60, type: "wall"},
    ],
  })

  const props = [...mapRenderer.objects.values()]
  const blocks = props.map(prop => prop.children.find(child => child.geometry?.userData?.stylizedStoneBlock))
  assert.equal(blocks.length, 2)
  blocks.forEach(block => block.geometry.computeBoundingBox())
  const firstSize = blocks[0].geometry.boundingBox.getSize(new THREE.Vector3())
  const secondSize = blocks[1].geometry.boundingBox.getSize(new THREE.Vector3())
  assert.ok(Math.abs(firstSize.x - 40 * WORLD_SCALE) < 1e-6)
  assert.ok(Math.abs(firstSize.z - 40 * WORLD_SCALE) < 1e-6)
  assert.ok(Math.abs(secondSize.x - firstSize.x) < 1e-6)
  assert.ok(Math.abs(secondSize.z - firstSize.z) < 1e-6)
  assert.equal(Math.abs(props[1].position.x - props[0].position.x), 40 * WORLD_SCALE)
  assert.equal(props[1].position.z, props[0].position.z)

  mapRenderer.dispose()
})

test("stone props cast real shadows with soft contact grounding", () => {
  const prop = createProp(
    {minX: 20, minY: 20, maxX: 60, maxY: 60, type: "wall"},
    0,
    new THREE.Texture(),
  )
  const block = prop.children.find(child => child.geometry?.userData?.stylizedStoneBlock)
  const contactShadow = prop.children.find(child => child.userData?.role === "contact-shadow")

  assert.equal(block.castShadow, true)
  assert.equal(block.receiveShadow, true)
  assert.ok(contactShadow)
  assert.equal(contactShadow.material.map?.isTexture, true)

  prop.traverse(node => {
    if (node.geometry) node.geometry.dispose()
    if (node.material) node.material.dispose()
  })
})

test("decorative props stay at authored cell size instead of merging into slabs", () => {
  const root = new THREE.Group()
  const mapRenderer = new MapRenderer(root, {waterTexture: new THREE.Texture()})

  mapRenderer.sync({
    width: 160,
    height: 120,
    walls: [
      {minX: 20, minY: 20, maxX: 60, maxY: 60, type: "crates"},
      {minX: 60, minY: 20, maxX: 100, maxY: 60, type: "crates"},
    ],
  })

  const props = [...mapRenderer.objects.values()]
  assert.equal(props.length, 2)
  assert.equal(props.every(prop => prop.userData.visualType === "crates"), true)
  assert.equal(props.every(prop => {
    let hasLog = false
    prop.traverse(child => { if (child.userData.role === "log-pile-log") hasLog = true })
    return hasLog
  }), true)
  assert.equal(Math.abs(props[1].position.x - props[0].position.x), 40 * WORLD_SCALE)
  mapRenderer.dispose()
})

test("map crate cells render as natural log piles instead of default box planks", () => {
  const prop = createProp(
    {minX: 20, minY: 20, maxX: 60, maxY: 60, type: "crates"},
    0,
    new THREE.Texture(),
  )
  const roles = new Set()
  prop.traverse(child => {
    if (child.userData?.role) roles.add(child.userData.role)
  })

  assert.equal(roles.has("log-pile-log"), true)
  assert.equal(roles.has("log-pile-moss"), true)
  assert.equal(roles.has("crate-plank"), false)

  prop.traverse(node => {
    node.geometry?.dispose?.()
    node.material?.dispose?.()
  })
})

test("solid map props receive a low-profile grounding bed", () => {
  const prop = createProp(
    {minX: 20, minY: 20, maxX: 60, maxY: 60, type: "wall"},
    0,
    new THREE.Texture(),
  )
  const bed = prop.getObjectByName("prop-grounding-bed")

  assert.ok(bed)
  assert.equal(bed.userData.role, "grounding-bed")
  assert.equal(bed.material.roughness, 1)
  assert.ok(bed.position.y > 0)

  prop.traverse(node => {
    node.geometry?.dispose?.()
    node.material?.dispose?.()
  })
})

test("shipwreck blockers render as volumetric natural root clusters", () => {
  const prop = createProp(
    {minX: 20, minY: 20, maxX: 60, maxY: 60, type: "shipwreck"},
    0,
    new THREE.Texture(),
  )
  const roles = new Set()
  const visual = prop.children.find(child => child.userData?.role !== "contact-shadow")
  visual.traverse(child => {
    if (child.userData?.role) roles.add(child.userData.role)
  })
  const size = new THREE.Box3().setFromObject(visual, true).getSize(new THREE.Vector3())

  assert.equal(roles.has("root-log"), true)
  assert.equal(roles.has("root-end"), true)
  assert.equal(roles.has("moss-clump"), true)
  assert.equal(roles.has("shipwreck-plank"), false)
  assert.ok(size.x >= 40 * WORLD_SCALE * .9)
  assert.ok(size.z >= 40 * WORLD_SCALE * .9)

  prop.traverse(node => {
    node.geometry?.dispose?.()
    node.material?.dispose?.()
  })
})

test("trees rise slightly above the stone wall silhouette", () => {
  const wall = createProp(
    {minX: 20, minY: 20, maxX: 60, maxY: 60, type: "wall"},
    0,
    new THREE.Texture(),
  )
  const wallVisual = wall.children.find(child => child.geometry?.userData?.stylizedStoneBlock)
  const wallTop = new THREE.Box3().setFromObject(wallVisual, true).max.y

  for (const type of ["tree", "dead_tree"]) {
    const prop = createProp(
      {minX: 20, minY: 20, maxX: 60, maxY: 60, type},
      0,
      new THREE.Texture(),
    )
    const visual = prop.children.find(child => child.userData?.role !== "contact-shadow")
    const treeTop = new THREE.Box3().setFromObject(visual, true).max.y
    assert.ok(treeTop > wallTop * 1.05, `${type} should rise above the wall silhouette`)

    prop.traverse(node => {
      node.geometry?.dispose?.()
      node.material?.dispose?.()
    })
  }

  wall.traverse(node => {
    node.geometry?.dispose?.()
    node.material?.dispose?.()
  })
})

test("small blocking props visually fill the collider footprint", () => {
  const colliderSize = 40 * WORLD_SCALE

  for (const type of ["crates", "barrels", "cactus", "crystal"]) {
    const prop = createProp(
      {minX: 20, minY: 20, maxX: 60, maxY: 60, type},
      0,
      new THREE.Texture(),
    )
    const visual = prop.children.find(child => child.userData?.role !== "contact-shadow")
    const size = new THREE.Box3().setFromObject(visual, true).getSize(new THREE.Vector3())

    assert.ok(size.x >= colliderSize * .92, `${type} leaves a visible horizontal collision gap`)
    assert.ok(size.z >= colliderSize * .92, `${type} leaves a visible depth collision gap`)

    prop.traverse(node => {
      node.geometry?.dispose?.()
      node.material?.dispose?.()
    })
  }
})

test("blocking map props visibly cover their authoritative collision tile", () => {
  const colliderSize = 40 * WORLD_SCALE
  const blockingTypes = [
    "destructible",
    "wall",
    "tree",
    "dead_tree",
    "shipwreck",
    "crates",
    "altar_three_moons",
    "sacrificial_stone",
    "menhir",
  ]

  for (const type of blockingTypes) {
    const prop = createProp(
      {minX: 20, minY: 20, maxX: 60, maxY: 60, type},
      0,
      new THREE.Texture(),
    )
    const visual = prop.children.find(child => child.userData?.role !== "contact-shadow")
    const size = new THREE.Box3().setFromObject(visual, true).getSize(new THREE.Vector3())

    assert.ok(size.x >= colliderSize * .92, `${type} leaves a visible horizontal collision gap`)
    assert.ok(size.z >= colliderSize * .92, `${type} leaves a visible depth collision gap`)

    prop.traverse(node => {
      node.geometry?.dispose?.()
      node.material?.dispose?.()
    })
  }
})

test("grass ground uses a subtle repeated natural texture", () => {
  const root = new THREE.Group()
  const ground = new GroundRenderer(root)

  ground.sync(1024, 768)

  assert.equal(ground.mesh.material.map?.isTexture, true)
  assert.ok(ground.mesh.material.map?.userData.meadowPatchCount >= 32)
  assert.equal(ground.mesh.material.map?.userData.grassBladeCount, 520)
  assert.equal(ground.mesh.material.roughness, 1)
  ground.mesh.geometry.dispose()
  ground.mesh.material.map.dispose()
  ground.mesh.material.dispose()
})

test("procedural bush foliage stays unlit and does not cast noisy shadows", () => {
  const field = createBushField([
    {minX: 20, minY: 20, maxX: 100, maxY: 60, type: "bush"},
  ])
  const base = field.getObjectByName("bush-field-base")
  const crown = field.getObjectByName("bush-field-crown")

  assert.equal(base.material.type, "MeshBasicMaterial")
  assert.equal(crown.material.type, "MeshBasicMaterial")
  assert.equal(base.castShadow, false)
  assert.equal(base.receiveShadow, false)
  assert.equal(crown.castShadow, false)
  assert.equal(crown.receiveShadow, false)

  field.traverse(node => {
    if (node.geometry) node.geometry.dispose()
    if (node.material) node.material.dispose()
  })
})

test("bush support volume reads as grass instead of a dark fake shadow", () => {
  const field = createBushField([
    {minX: 20, minY: 20, maxX: 100, maxY: 60, type: "bush"},
  ])
  const base = field.getObjectByName("bush-field-base")

  assert.equal(base.material.color.getHex(), 0xffffff)
  assert.ok(base.material.opacity > .8)
  assert.equal(base.material.depthWrite, false)
  assert.equal(field.getObjectByName("bush-field-foreground").material.depthWrite, false)

  field.traverse(node => {
    if (node.geometry) node.geometry.dispose()
    if (node.material) node.material.dispose()
  })
})

test("combat effects keep the full orbital visual on the shared path", () => {
  const root = new THREE.Group()
  const renderer = new EffectRenderer(root)
  renderer.sync([{
    id: "orbital-1",
    kind: "lumi_roots",
    x: 120,
    y: 220,
    radius: 40,
    life: .5,
    maxLife: .52,
  }])

  assert.equal(root.children.length, 1)
  assert.equal(root.children[0].isGroup, true)
  assert.equal(root.children[0].children.length, 9)
})

test("Brock armed beam renders as a directional lane instead of a ring", () => {
  const root = new THREE.Group()
  const renderer = new EffectRenderer(root)
  renderer.sync([{
    id: "zeus-beam",
    kind: "zeus_beam_hole",
    x: 100,
    y: 200,
    toX: 900,
    toY: 200,
    radius: 20,
    life: .4,
    maxLife: .5,
  }])

  const beam = root.children[0]
  assert.equal(beam.geometry.type, "PlaneGeometry")
  assert.ok(Math.abs(beam.scale.x - 800 * WORLD_SCALE) < .001)
})

test("Brock strike warnings render as readable target reticles", () => {
  const root = new THREE.Group()
  const renderer = new EffectRenderer(root)
  renderer.sync([{
    id: "zeus-warning",
    kind: "zeus_strike_warning",
    x: 300,
    y: 300,
    radius: 62,
    life: .8,
    maxLife: 1,
  }])

  const roles = []
  root.traverse(child => {
    if (child.userData.role) roles.push(child.userData.role)
  })
  assert.ok(roles.includes("telegraph-ring"))
  assert.equal(roles.filter(role => role === "telegraph-tick").length, 4)
})

test("Mina mark detonation renders as a short radial impact burst", () => {
  const root = new THREE.Group()
  const renderer = new EffectRenderer(root)
  renderer.sync([{
    id: "mina-burst",
    kind: "mina_mark_burst",
    x: 300,
    y: 300,
    radius: 36,
    life: .3,
    maxLife: .42,
  }])

  const shards = []
  root.traverse(child => {
    if (child.userData.role === "impact-shard") shards.push(child)
  })
  assert.equal(shards.length, 8)
})

test("un-authored concealment fields use one instanced square-tile field per clearing", () => {
  const root = new THREE.Group()
  const mapRenderer = new MapRenderer(root, {waterTexture: new THREE.Texture()})

  mapRenderer.sync({
    width: 240,
    height: 180,
    walls: [
      {minX: 20, minY: 20, maxX: 100, maxY: 60, type: "moon_mist"},
      {minX: 120, minY: 80, maxX: 200, maxY: 120, type: "moon_mist"},
    ],
  })

  assert.equal(mapRenderer.objects.size, 2)
  const fallback = [...mapRenderer.objects.values()][0]
  assert.equal(fallback.isGroup, true)
  assert.equal(fallback.getObjectByName("bush-field-base").count, 2)
  assert.ok(fallback.getObjectByName("bush-field-crown").count >= 25)
  mapRenderer.dispose()
})

test("concealment fields use a dense procedural leaf field on the shared path", () => {
  const root = new THREE.Group()
  const mapRenderer = new MapRenderer(root, {waterTexture: new THREE.Texture()})

  mapRenderer.sync({
    width: 240,
    height: 180,
    walls: [{minX: 20, minY: 20, maxX: 60, maxY: 60, type: "moon_mist"}],
  })

  const bushBatch = [...mapRenderer.objects.values()]
    .map(object => object.getObjectByName?.("bush-field-crown") || object)
    .find(object => object?.geometry?.userData?.bushLeafCluster)
  assert.ok(bushBatch.count >= 25)
  assert.equal(bushBatch.geometry.userData.bushLeafCluster, true)
  mapRenderer.dispose()
})

test("stone walls keep fixed cells and can form contiguous barriers", () => {
  const root = new THREE.Group()
  const mapRenderer = new MapRenderer(root, {waterTexture: new THREE.Texture()})

  mapRenderer.sync({
    width: 160,
    height: 120,
    tileSize: 40,
    walls: [
      {minX: 20, minY: 20, maxX: 60, maxY: 60, type: "wall"},
      {minX: 60, minY: 20, maxX: 100, maxY: 60, type: "wall"},
    ],
  })

  const wallObjects = [...mapRenderer.objects.values()]
  assert.equal(wallObjects.length, 2)
  assert.equal(wallObjects.every(object => object.children.length >= 3), true)
  assert.equal(wallObjects.every(object => object.children.some(child => child.userData?.role === "contact-shadow")), true)
  assert.equal(wallObjects.every(object => object.children.some(child => child.userData?.role === "grounding-bed")), true)
  assert.ok(wallObjects.every(object => object.children[0].castShadow))
  assert.ok(Math.abs(Math.abs(wallObjects[1].position.x - wallObjects[0].position.x) - 40 * WORLD_SCALE) < 1e-5)

  mapRenderer.dispose()
})

test("moving the environment focus keeps the procedural map object mounted", () => {
  const root = new THREE.Group()
  const mapRenderer = new MapRenderer(root, {waterTexture: new THREE.Texture()})
  mapRenderer.setFocus(40, 40)
  mapRenderer.sync({
    width: 2400,
    height: 2400,
    walls: [{minX: 20, minY: 20, maxX: 60, maxY: 60, type: "wall"}],
  })
  const proceduralWall = [...mapRenderer.objects.values()][0]

  mapRenderer.setFocus(2000, 2000)

  assert.equal([...mapRenderer.objects.values()][0], proceduralWall)
  assert.equal(proceduralWall.parent, root)
  mapRenderer.dispose()
})

test("environment focus refreshes only after a coarse world-space transition", () => {
  assert.equal(shouldRefreshEnvironmentFocus(null, {x: 0, y: 0}), true)
  assert.equal(shouldRefreshEnvironmentFocus({x: 0, y: 0}, {x: 255, y: 0}), false)
  assert.equal(shouldRefreshEnvironmentFocus({x: 0, y: 0}, {x: 256, y: 0}), true)
})

test("island decoration stays below impassable map surfaces", () => {
  const root = new THREE.Group()
  const mapRenderer = new MapRenderer(root, {waterTexture: new THREE.Texture()})

  mapRenderer.syncIslandTerrain(true, 2400, 2400)

  const layerHeights = mapRenderer.islandTerrain.children.slice(0, 3).map(layer => layer.position.y)
  assert.ok(Math.max(...layerHeights) < 0.015)
  mapRenderer.dispose()
})

test("island decoration uses non-overlapping surfaces to avoid depth-fighting fans", () => {
  const root = new THREE.Group()
  const mapRenderer = new MapRenderer(root, {waterTexture: new THREE.Texture()})

  mapRenderer.syncIslandTerrain(true, 2400, 2400)

  const layers = mapRenderer.islandTerrain.children.slice(0, 3)
  assert.equal(layers[0].geometry.type, "RingGeometry")
  assert.equal(layers[1].geometry.type, "RingGeometry")
  assert.equal(layers[2].geometry.type, "CircleGeometry")
  assert.equal(layers.every(layer => layer.material.polygonOffset), true)
  assert.equal(layers[0].geometry.parameters.innerRadius, layers[1].geometry.parameters.outerRadius)
  assert.equal(layers[1].geometry.parameters.innerRadius, layers[2].geometry.parameters.radius)
  mapRenderer.dispose()
})

test("island approach bridges use faceted stone stepping slabs", () => {
  const root = new THREE.Group()
  const mapRenderer = new MapRenderer(root, {waterTexture: new THREE.Texture()})

  mapRenderer.syncIslandTerrain(true, 2400, 2400)

  const bridges = []
  root.traverse(node => {
    if (node.name === "island-bridge") bridges.push(node)
  })
  assert.equal(bridges.length, 2)
  assert.ok(bridges.every(bridge => bridge.children.length >= 5))
  assert.ok(bridges.every(bridge => bridge.children.every(child => child.userData.role === "bridge-stone" || child.userData.role === "bridge-moss")))
  assert.ok(bridges.every(bridge => bridge.children.some(child => child.userData.role === "bridge-moss")))

  mapRenderer.dispose()
})

test("first-trial beacon is a layered faceted landmark with animated energy details", () => {
  const root = new THREE.Group()
  const mapRenderer = new MapRenderer(root, {waterTexture: new THREE.Texture()})

  mapRenderer.syncIsland({islandName: "Остров Первого Испытания", beaconOpen: false}, 2400, 2400)

  const beacon = mapRenderer.beaconGroup
  assert.ok(beacon)
  assert.equal(beacon.userData.role, "beacon")
  assert.ok(beacon.scale.x >= 20)
  assert.equal(beacon.scale.x, beacon.scale.y)
  assert.equal(beacon.scale.y, beacon.scale.z)
  for (const name of [
    "beacon-pedestal",
    "beacon-tower",
    "beacon-core",
    "beacon-beam",
    "beacon-beam-core",
    "beacon-activation-ring",
  ]) {
    assert.ok(beacon.getObjectByName(name), `missing ${name}`)
  }

  const tower = beacon.getObjectByName("beacon-tower")
  const beam = beacon.getObjectByName("beacon-beam")
  const beamCore = beacon.getObjectByName("beacon-beam-core")
  const core = beacon.getObjectByName("beacon-core")
  assert.equal(tower.material.flatShading, true)
  assert.equal(tower.geometry.parameters.radialSegments, 8)
  assert.equal(beam.material.depthWrite, false)
  assert.equal(beam.material.side, THREE.DoubleSide)
  assert.equal(beamCore.material.depthWrite, false)
  assert.ok(core.material.emissiveIntensity > 0)

  const beaconRotation = beacon.rotation.y
  const coreRotation = core.rotation.y
  mapRenderer.update(.5)
  assert.equal(beacon.rotation.y, beaconRotation)
  assert.ok(core.rotation.y > coreRotation)

  const closedBeamOpacity = beam.material.opacity
  const closedCoreIntensity = core.material.emissiveIntensity
  mapRenderer.syncIsland({islandName: "Остров Первого Испытания", beaconOpen: true}, 2400, 2400)
  assert.equal(beacon.userData.open, true)
  assert.ok(beam.material.opacity > closedBeamOpacity)
  assert.ok(core.material.emissiveIntensity > closedCoreIntensity)

  mapRenderer.dispose()
})

test("map atmosphere changes with every playable island phase", () => {
  const root = new THREE.Group()
  const mapRenderer = new MapRenderer(root, {waterTexture: new THREE.Texture()})

  const colors = new Set()
  let atmosphere = null
  for (const phase of ["hunt", "challenge", "collapse", "beacon"]) {
    mapRenderer.syncIsland({phase}, 2400, 2400)
    atmosphere = mapRenderer.phaseAtmosphere
    colors.add(atmosphere.material.color.getHex())
  }

  assert.equal(colors.size, 4)
  assert.equal(mapRenderer.phaseAtmosphere, atmosphere)
  assert.equal(atmosphere.visible, true)
  mapRenderer.dispose()
})

test("storm radius eases between snapshots instead of jumping", () => {
  const next = smoothStormRadius(600, 500, 1 / 30)

  assert.ok(next < 600)
  assert.ok(next > 500)
  assert.equal(smoothStormRadius(500, 500, 1 / 30), 500)
})

test("storm overlay keeps one continuous, unobstructed ring while shrinking", () => {
  const geometry = createStormRingGeometry(500, 900, 12)
  const root = new THREE.Group()
  const mapRenderer = new MapRenderer(root, {waterTexture: new THREE.Texture()})

  mapRenderer.syncIsland({stormRadius: 600}, 2400, 2400)
  const stormMesh = mapRenderer.stormMesh
  mapRenderer.syncIsland({stormRadius: 599.2}, 2400, 2400)
  mapRenderer.update(1 / 30)

  assert.equal(mapRenderer.stormMesh, stormMesh)
  assert.equal(stormMesh.material.depthTest, false)
  assert.equal(stormMesh.userData.role, "storm-overlay")
  assert.ok(mapRenderer.stormRadius < 600)
  assert.ok(mapRenderer.stormRadius > 599.2)
  assert.equal(stormMesh.rotation.x, -Math.PI / 2)
  assert.equal(stormMesh.rotation.y, 0)
  assert.equal(geometry.getAttribute("position").count, 26)
  geometry.dispose()
  mapRenderer.dispose()
})

test("ordinary grass is a single flat green ground without dense black-prone instances", () => {
  const root = new THREE.Group()
  const ground = new GroundRenderer(root)

  ground.sync(1024, 768)

  assert.equal(root.children.length, 1)
  assert.equal(root.children[0], ground.mesh)
  assert.equal(ground.mesh.userData.role, "grass-ground")
  assert.equal(ground.mesh.material.color.getHex(), 0x4f9b50)
})

test("grass ground receives directional prop shadows", () => {
  const root = new THREE.Group()
  const ground = new GroundRenderer(root)

  ground.sync(1024, 768)

  assert.equal(ground.mesh.receiveShadow, true)
  assert.equal(ground.mesh.material.type, "MeshStandardMaterial")
  ground.mesh.geometry.dispose()
  ground.mesh.material.dispose()
})

test("map signature changes when only a wall visual changes", () => {
  const first = {width: 100, height: 100, walls: [{minX: 0, minY: 0, maxX: 40, maxY: 40, type: "crates", visual: "desert_wall_a"}]}
  const second = {width: 100, height: 100, walls: [{...first.walls[0], visual: "barrel_a"}]}
  assert.notEqual(createMapSignature(first), createMapSignature(second))
})
