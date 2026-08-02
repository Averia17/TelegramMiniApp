import test from "node:test"
import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"
import {fileURLToPath} from "node:url"

import {
  ENVIRONMENT_ASSETS,
  HERO_ASSETS,
  getHeroAsset,
  resolveHeroName,
  resolveEnvironmentVisual,
} from "../src/components/BattleGame/rendering/assets/assetManifest.js"
import {AssetRegistry, normalizeHeroHeight} from "../src/components/BattleGame/rendering/assets/AssetRegistry.js"
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
import {MapRenderer} from "../src/components/BattleGame/rendering/map/MapRenderer.js"
import {PickupRenderer} from "../src/components/BattleGame/rendering/map/PickupRenderer.js"
import {EffectRenderer} from "../src/components/BattleGame/rendering/combat/EffectRenderer.js"
import {
  getBattlePlayerCount,
  getBattleRewardMessage,
  getPlayerBattleStats,
  getStateBattleResult,
  getSynchronizedBattleView,
} from "../src/components/BattleGame/battleOutcome.js"
import {isAlivePlayerState} from "../src/components/BattleGame/rendering/heroes/playerVisibility.js"
import {ANIMATION_REFERENCE_SPEED, HEROES_CONFIG, RUNTIME_ANIMATION_REFERENCE_SPEED} from "../src/components/BattleGame/heroesConfig.js"
import {
  getEnvironmentPlacements,
  replaceFallbackWithEnvironment,
} from "../src/components/BattleGame/rendering/map/environmentPlacement.js"
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
  assert.equal(BUSH_HERO_OPACITY >= .7, true)
  assert.equal(getBushConcealmentMix(0, true, .1) > 0, true)
  assert.equal(getBushConcealmentMix(1, false, .1) < 1, true)
})

test("attack direction guides never stay visible while aiming", () => {
  const root = new THREE.Group()
  const aim = new AimRenderer(root)
  aim.update({
    aiming: true,
    x: 100,
    y: 200,
    rotation: .4,
    attackArchetype: "melee_cone",
    attackRange: 105,
    attackHalfArcDegrees: 55,
    color: "#B88CFF",
  })
  assert.equal(aim.root.visible, false)

  aim.update({
    aiming: true,
    x: 100,
    y: 200,
    rotation: .4,
    attackArchetype: "projectile",
    attackRange: 760,
    color: "#62C8FF",
  })
  assert.equal(aim.root.visible, false)
})

test("attack direction guides stay hidden after an attack pulse", () => {
  const root = new THREE.Group()
  const aim = new AimRenderer(root)
  const base = {
    aiming: false,
    attackPulse: 1,
    x: 100,
    y: 200,
    rotation: .4,
    attackArchetype: "melee_cone",
    attackRange: 120,
    attackHalfArcDegrees: 48,
    color: "#FFB33E",
  }
  aim.update({...base, attackPulse: 0})
  aim.update(base, .016)
  assert.equal(aim.root.visible, false)
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

test("queued hero-card previews receive a slot after an earlier snapshot releases it", async () => {
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
    totems: [{owner: "damian", x: 60, y: 70}],
  }
  const second = {
    type: "state",
    ts: 1033,
    players: {enemy: {x: 99, y: 10, rotation: .3}},
    monsters: {bat: {x: 119, y: 30, rotation: .3}},
    bullets: [{id: 7, x: 139, y: 50, z: 33, rotation: .3}],
    totems: [{owner: "damian", x: 159, y: 70}],
  }
  simulation.snapshots = [first, second]
  simulation.latestState = second
  simulation.clockOffset = 5000

  const display = simulation.getDisplayState(6116.5)
  assert.equal(Math.abs(display.players.enemy.x - 49.5) < .001, true)
  assert.equal(Math.abs(display.monsters.bat.x - 69.5) < .001, true)
  assert.equal(Math.abs(display.bullets[0].x - 89.5) < .001, true)
  assert.equal(Math.abs(display.bullets[0].z - 16.5) < .001, true)
  assert.equal(Math.abs(display.totems[0].x - 109.5) < .001, true)
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
    totems: null,
  })

  const display = simulation.getDisplayState(1000)
  assert.equal(display.map.walls, walls)
  assert.deepEqual(display.monsters, {})
  assert.deepEqual(display.bullets, [])
  assert.deepEqual(display.totems, [])
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
  assert.equal(mapRenderer.objects.size, 2)
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

test("the hero manifest uses standardized base GLBs and optional detached weapons", () => {
  assert.deepEqual(Object.keys(HERO_ASSETS), ["Needle", "Mandy", "Fairy Mina", "Brock Zeus", "Kaze", "Wukong Mico", "Damian", "Persephone Lumi"])
  for (const name of Object.keys(HERO_ASSETS)) {
    const asset = getHeroAsset(name)
    assert.equal(asset.id, name)
    assert.equal(asset.scale > 0, true)
    const expectedClipKeys = ["Needle", "Mandy", "Fairy Mina", "Brock Zeus", "Kaze"].includes(name)
      ? ["idle", "run", "hit", "aim", "aimSuper", "attack", "super", "gadget", "spawn", "victory", "defeat", "aimGadget"]
      : ["idle", "run", "hit", "aim", "aimSuper", "attack", "super", "gadget", "spawn", "victory", "defeat"]
    assert.deepEqual(Object.keys(asset.clips), expectedClipKeys)
    assert.equal("eventAnimations" in asset, false)
    assert.match(asset.url, /\/assets\/heroes\/output_heroes\/[^/]+_base\.glb$/)
    if (asset.weaponUrl) {
      assert.match(asset.weaponUrl, /\/assets\/heroes\/output_weapons\/[^/]+_weapon\.glb$/)
    }
  }
  for (const name of Object.keys(HERO_ASSETS)) assert.equal(HERO_ASSETS[name].available, true)
  assert.equal(HERO_ASSETS.Needle.url, "/assets/heroes/output_heroes/needle_base.glb")
  assert.equal(HERO_ASSETS.Mandy.weaponUrl, "/assets/heroes/output_weapons/mandy_weapon.glb")
  assert.equal(HERO_ASSETS.Damian.groundOffset, 0.25)
  assert.deepEqual(HEROES_CONFIG.map(hero => hero.name), Object.keys(HERO_ASSETS))
})

test("hero asset resolution keeps canonical names and handles unknown names safely", () => {
  assert.equal(resolveHeroName("Mandy"), "Mandy")
  assert.equal(resolveHeroName("needle"), "Needle")
  assert.equal(resolveHeroName("fairy-mina"), "Fairy Mina")
  assert.equal(resolveHeroName("brock-zeus"), "Brock Zeus")
  assert.equal(resolveHeroName("wukong-mico"), "Wukong Mico")
  assert.equal(resolveHeroName("persephone-lumi"), "Persephone Lumi")
  assert.equal(resolveHeroName("missing-hero"), "Mandy")
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

test("battle loop throttles expensive renderer state synchronization", async () => {
  const battleSource = await readFile(projectFile("src/components/BattleGame/BattleGame.jsx"), "utf8")

  assert.match(battleSource, /BATTLE_RENDER_STATE_INTERVAL\s*=\s*1\s*\/\s*30/)
  assert.match(battleSource, /stateSyncElapsed\s*\+=\s*delta/)
  assert.match(battleSource, /stateSyncElapsed\s*>=\s*BATTLE_RENDER_STATE_INTERVAL/)
})

test("battle loading stays visible until the first arena frame is rendered", async () => {
  const source = await readFile(projectFile("src/components/BattleGame/BattleGame.jsx"), "utf8")

  assert.match(source, /const \[sceneReady, setSceneReady\] = useState\(false\)/)
  assert.match(source, /!sceneReady \|\| view === "connecting"/)
  assert.match(source, /setSceneReady\(true\)/)
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

test("a lethal battle snapshot opens results before the UI view catches up", () => {
  const state = {
    game: {state: "game"},
    players: {
      local: {lives: 0},
      alive: {lives: 1200},
    },
  }

  assert.deepEqual(getStateBattleResult(state, "local", "lobby"), {
    won: false,
    place: 2,
    kills: 0,
    monsters: 0,
    duration: 0,
  })
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

test("the battle scene provides PBR lighting and soft shadows for GLB heroes", async () => {
  const source = await readFile(projectFile("src/components/BattleGame/rendering/SceneRoot.js"), "utf8")
  assert.match(source, /HemisphereLight/)
  assert.match(source, /DirectionalLight/)
  assert.match(source, /PCFSoftShadowMap/)
})

test("battle renderer drops expensive quality settings after sustained slow frames", async () => {
  const source = await readFile(projectFile("src/components/BattleGame/rendering/three/ThreeBattleRenderer.js"), "utf8")

  assert.match(source, /slowFrameCount/)
  assert.match(source, /frameElapsed >= 22/)
  assert.match(source, /slowFrameCount >= 10/)
  assert.match(source, /this\.enableLowQuality\(\)/)
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

test("AssetRegistry attaches detached weapon geometry to its authored grip marker", async () => {
  const heroScene = new THREE.Group()
  const hand = new THREE.Bone()
  hand.name = "L_wrist_s"
  hand.position.set(.4, 1.2, -.2)
  hand.rotation.set(.2, -.35, .1)
  hand.scale.setScalar(1.8)
  const socket = new THREE.Bone()
  socket.name = "weapon_socket_l"
  hand.add(socket)
  const grip = new THREE.Group()
  grip.name = "GripPrimaryHeroAttachment_TestWeapon"
  grip.position.set(0, .4, .1)
  socket.add(grip)
  heroScene.add(hand)

  const weaponScene = new THREE.Group()
  const weaponObject = new THREE.Group()
  weaponObject.name = "HeroAttachment_TestWeapon"
  const weaponMesh = new THREE.Mesh(
    new THREE.BoxGeometry(.1, 1, .1),
    new THREE.MeshBasicMaterial(),
  )
  weaponMesh.position.set(1, 0, 0)
  weaponObject.add(weaponMesh)
  weaponScene.add(weaponObject)

  const loads = []
  const registry = new AssetRegistry({
    manifest: {
      TestHero: {
        id: "TestHero",
        url: "/test_base.glb",
        weaponUrl: "/test_weapon.glb",
        weaponAttachments: [{
          name: "HeroAttachment_TestWeapon",
          target: "GripPrimaryHeroAttachment_TestWeapon",
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
      return url.includes("weapon")
        ? {scene: weaponScene, animations: []}
        : {scene: heroScene, animations: []}
    },
  })

  const instance = await registry.instantiateHero("TestHero")
  const attachedSocket = instance.root.getObjectByName("GripPrimaryHeroAttachment_TestWeapon")
  const attachedWeapon = instance.root.getObjectByName("DetachedHeroWeapon.HeroAttachment_TestWeapon")
  assert.deepEqual(loads, ["/test_base.glb", "/test_weapon.glb"])
  assert.equal(attachedWeapon.parent, attachedSocket)
  assert.equal(attachedWeapon.position.length() < 1e-8, true)
  attachedSocket.updateWorldMatrix(true, true)
  const socketPosition = attachedSocket.getWorldPosition(new THREE.Vector3())
  const weaponPosition = attachedWeapon.getWorldPosition(new THREE.Vector3())
  assert.equal(socketPosition.distanceTo(weaponPosition) < 1e-8, true)
  const weaponBounds = new THREE.Box3().setFromObject(attachedWeapon, true)
  assert.equal(weaponBounds.distanceToPoint(socketPosition) < 1e-8, true)
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

test("the app does not preload every hero GLB before the first render", async () => {
  const source = await readFile(projectFile("src/main.jsx"), "utf8")
  assert.doesNotMatch(source, /assetRegistry\.preloadAll\(/)
})

test("battle hero GLB upgrades wait for idle time after the fallback is visible", async () => {
  const source = await readFile(projectFile("src/components/BattleGame/rendering/heroes/HeroView.js"), "utf8")
  assert.match(source, /requestIdleCallback/)
  assert.match(source, /await waitForHeroUpgradeIdle\(\)/)
})

test("AssetRegistry applies a hero ground offset after height normalization", async () => {
  const template = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshBasicMaterial())
  body.position.y = 1
  template.add(body)
  const registry = new AssetRegistry({
    manifest: {
      Damian: {
        id: "Damian",
        url: "/damian.glb",
        available: true,
        scale: 1,
        targetHeight: 2,
        groundOffset: .25,
        rotationOffset: 0,
        clips: {},
      },
    },
    load: async () => ({scene: template, animations: []}),
  })

  const instance = await registry.instantiateHero("Damian")
  assert.equal(instance.root.position.y, .25)
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

test("hero selection replaces the WebGL canvas when the selected GLB changes", async () => {
  const source = await readFile(projectFile("src/components/HeroSelect/HeroModelPreview.jsx"), "utf8")
  assert.match(source, /key=\{hero\?\.name\}/)
  assert.match(source, /MAX_CARD_PREVIEW_RENDERERS/)
  assert.match(source, /try \{\s*renderer\s*=\s*new THREE\.WebGLRenderer/)
  assert.match(source, /unregisterPreviewRenderer\(renderer\)/)
  assert.match(source, /if\s*\(disposed\s*\|\|[^)]*renderer\.getContext\(\)\?\.isContextLost\(\)\)\s*return/)
  assert.match(source, /renderer\.forceContextLoss\(\)/)
  assert.match(source, /previewSnapshots/)
  assert.match(source, /canvas\.toDataURL/)
  assert.match(source, /acquirePreviewSlot/)
  assert.match(source, /hero-model-snapshot/)
  assert.doesNotMatch(source, /createHeroModel/)
  assert.match(source, /hero-model-preview--loading/)
})

test("mobile roster cards anchor scaled hero previews above their footer", async () => {
  const css = await readFile(new URL("../src/components/HeroSelect/HeroSelect.css", import.meta.url), "utf8")
  assert.match(css, /\.hero-card \.hero-portrait:has\(\.hero-model-canvas\)[^{]*\{[^}]*transform-origin:50% 0/)
  assert.match(css, /@media \(max-width:430px\)[^{]*\{[^{}]*\.hero-card \.hero-portrait:has\(\.hero-model-canvas\)[^{]*\{[^}]*scale\(\.58\)/)
})

test("a transparent hero snapshot hides the released WebGL canvas underneath it", async () => {
  const css = await readFile(new URL("../src/components/HeroSelect/HeroSelect.css", import.meta.url), "utf8")
  assert.match(css, /\.hero-model-preview:has\(\.hero-model-snapshot\) \.hero-model-canvas\s*\{[^}]*visibility:\s*hidden/)
})

test("hero-card snapshots wait for the GLB skeleton to settle before capture", async () => {
  const source = await readFile(projectFile("src/components/HeroSelect/HeroModelPreview.jsx"), "utf8")
  assert.match(source, /renderedModelFrames\s*>=\s*8/)
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

test("hero equipment profiles hide detached ammo and animate Brock's nearby cloud", () => {
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
  assert.equal(mina.heldProjectile.parent, minaWrist)
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
  assert.equal(cloudCenter.distanceTo(new THREE.Vector3(.58, 1.32, -.10)) < .001, true)
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

test("Damian releases the carried speaker only during the throw window", () => {
  const root = new THREE.Group()
  const speaker = new THREE.Group()
  speaker.name = "HeroAttachment_Speaker"
  speaker.userData.attachment_role = "throwable-weapon"
  root.add(speaker)
  const attack = new THREE.AnimationClip("Attack", .6, [])
  const controller = new GLBHeroController(root, [attack], {attack: "Attack"}, {
    heroName: "Damian",
    attackPulse: 0,
    spawnOnLoad: false,
  })

  controller.update(.016, {alive: true, attackPulse: 1})
  assert.equal(speaker.visible, true)
  controller.update(.32, {alive: true, attackPulse: 1})
  assert.equal(speaker.visible, false)
  controller.update(.34, {alive: true, attackPulse: 1})
  assert.equal(speaker.visible, true)
  controller.dispose()
})

test("new hero projectiles match the detached object used by the attack", () => {
  const mina = createProjectileVisual({kind: "mina_star_fan"})
  assert.equal(mina.userData.vfxType, "fairy-orb")
  const damian = createProjectileVisual({kind: "damian_dark_orb"})
  assert.equal(damian.userData.vfxType, "thrown-speaker")
})

test("short-lived projectiles use emissive visuals without dynamic scene lights", () => {
  for (const kind of ["spore", "zeus_lightning", "mina_star_fan", "damian_dark_orb"]) {
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

test("map visuals are optional and never replace semantic collision types", () => {
  assert.equal(resolveEnvironmentVisual({type: "crates"}), "crate_a")
  assert.equal(resolveEnvironmentVisual({type: "destructible", visual: "desert_wall_b"}), "desert_wall_b")
  assert.equal(resolveEnvironmentVisual({type: "unknown"}), null)
})

test("island decoration stays below impassable map surfaces", () => {
  const root = new THREE.Group()
  const mapRenderer = new MapRenderer(root, {waterTexture: new THREE.Texture()})

  mapRenderer.syncIslandTerrain(true, 2400, 2400)

  const layerHeights = mapRenderer.islandTerrain.children.slice(0, 3).map(layer => layer.position.y)
  assert.ok(Math.max(...layerHeights) < 0.015)
  mapRenderer.dispose()
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
