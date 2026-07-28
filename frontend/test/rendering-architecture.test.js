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
import {
  BUSH_HERO_OPACITY,
  createBushOcclusion,
  getBushConcealmentMix,
} from "../src/components/BattleGame/rendering/heroes/BushConcealment.js"
import {createProjectileVisual} from "../src/components/BattleGame/rendering/combat/ProjectileRenderer.js"
import {
  MonsterRenderer,
  formatHealthLabel,
} from "../src/components/BattleGame/rendering/monsters/MonsterRenderer.js"
import {getBattleWebGLContext} from "../src/components/BattleGame/rendering/SceneRoot.js"
import {
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
import {getPlayerBattleStats, getStateBattleResult} from "../src/components/BattleGame/battleOutcome.js"
import {HEROES_CONFIG} from "../src/components/BattleGame/heroesConfig.js"
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

test("hero turning follows the shortest arc through intermediate directions", () => {
  const quarterTurn = turnTowardsAngle(0, Math.PI / 2, .05)
  assert.equal(quarterTurn > 0, true)
  assert.equal(quarterTurn < Math.PI / 2, true)

  const wrappedTurn = turnTowardsAngle(Math.PI - .1, -Math.PI + .1, .05)
  assert.equal(wrappedTurn > Math.PI - .1, true)
  assert.equal(wrappedTurn < Math.PI + .1, true)
})

test("bush concealment keeps the brawler readable and covers only the lower silhouette", () => {
  assert.equal(BUSH_HERO_OPACITY >= .74, true)
  assert.equal(getBushConcealmentMix(0, true, .1) > 0, true)
  assert.equal(getBushConcealmentMix(1, false, .1) < 1, true)

  const occlusion = createBushOcclusion()
  assert.equal(occlusion.userData.role, "bush-foreground-occlusion")
  assert.equal(occlusion.children.length >= 7, true)
  assert.equal(occlusion.children.every(child => child.position.y < 1.35), true)
  assert.equal(occlusion.children.every(child => child.material.depthTest === false), true)
})

test("aim rendering uses a configured forward area for melee and a direction for ranged heroes", () => {
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
  assert.equal(aim.meleeArea.visible, true)
  assert.equal(aim.line.visible, false)
  assert.equal(aim.meleeArea.userData.halfArcDegrees, 55)
  assert.equal(Math.abs(aim.meleeArea.scale.x - 105 * WORLD_SCALE) < .001, true)

  aim.update({
    aiming: true,
    x: 100,
    y: 200,
    rotation: .4,
    attackArchetype: "projectile",
    attackRange: 760,
    color: "#62C8FF",
  })
  assert.equal(aim.meleeArea.visible, false)
  assert.equal(aim.line.visible, true)
  assert.equal(aim.target.visible, true)
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
  assert.equal(bat.healthBar.scale.x >= 1.2, true)
  assert.equal(bat.healthBar.scale.y >= 1.2, true)
  assert.deepEqual(bat.group.position.toArray(), worldToScene(120, 220, 22).toArray())
  monsters.update(.1, 1)
  assert.equal(Math.abs(bat.leftWing.rotation.z) > 0, true)

  monsters.sync({})
  assert.equal(monsters.views.size, 0)
  monsters.dispose()
})

test("health labels show exact remaining and maximum HP", () => {
  assert.equal(formatHealthLabel(1840, 3600), "1840 / 3600")
  assert.equal(formatHealthLabel(-20, 3600), "0 / 3600")
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

test("the hero manifest defines every imported hero with the complete animation state machine", () => {
  assert.deepEqual(Object.keys(HERO_ASSETS), ["Shadow", "Mandy", "Fairy Mina", "Brock Zeus", "Kaze", "Wukong Mico", "Damian", "Persephone Lumi"])
  for (const name of Object.keys(HERO_ASSETS)) {
    const asset = getHeroAsset(name)
    assert.equal(asset.id, name)
    assert.equal(asset.scale > 0, true)
    assert.deepEqual(Object.keys(asset.clips), ["idle", "run", "aim", "aimSuper", "attack", "super", "spawn", "victory", "defeat"])
    assert.deepEqual(Object.keys(asset.eventAnimations), [
      "idle", "run", "aim", "aimSuper", "attack", "super", "spawn", "victory", "defeat",
    ])
    assert.match(asset.eventAnimations.idle.url, /\/animations\/idle\.glb$/)
    assert.equal(asset.eventAnimations.idle.clip, "Idle")
    assert.match(asset.eventAnimations.run.url, /\/animations\/run\.glb$/)
    assert.equal(asset.eventAnimations.run.clip, "Run")
    assert.match(asset.eventAnimations.aim.url, /\/animations\/aim\.glb$/)
    assert.equal(asset.eventAnimations.aim.clip, "Aim")
    assert.match(asset.eventAnimations.aimSuper.url, /\/animations\/aim-super\.glb$/)
    assert.equal(asset.eventAnimations.aimSuper.clip, "AimSuper")
    assert.match(asset.eventAnimations.attack.url, /\/animations\/attack\.glb$/)
    assert.equal(asset.eventAnimations.attack.clip, "Attack")
    assert.match(asset.eventAnimations.spawn.url, /\/animations\/spawn\.glb$/)
    assert.equal(asset.eventAnimations.spawn.clip, "Spawn")
    assert.match(asset.eventAnimations.super.url, /\/animations\/super\.glb$/)
    assert.equal(asset.eventAnimations.super.clip, "Super")
    assert.match(asset.eventAnimations.victory.url, /\/animations\/victory\.glb$/)
    assert.equal(asset.eventAnimations.victory.clip, "Victory")
    assert.match(asset.eventAnimations.defeat.url, /\/animations\/defeat\.glb$/)
    assert.equal(asset.eventAnimations.defeat.clip, "Defeat")
  }
  for (const name of Object.keys(HERO_ASSETS)) assert.equal(HERO_ASSETS[name].available, true)
  assert.equal(HERO_ASSETS.Shadow.url, "/assets/heroes/needle/needle.glb")
  assert.equal(HERO_ASSETS.Mandy.url, "/assets/heroes/mandy/mandy.glb")
  assert.equal(HERO_ASSETS.Damian.groundOffset, 0.25)
  assert.deepEqual(HEROES_CONFIG.map(hero => hero.name), Object.keys(HERO_ASSETS))
})

test("the runtime renderer has no Canvas2D engine switch or fallback", async () => {
  const source = await readFile(projectFile("src/components/BattleGame/Renderer.js"), "utf8")
  assert.doesNotMatch(source, /CanvasRenderer|battle_renderer|renderer=|getContext\(["']2d["']\)/)
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

test("AssetRegistry loads event clips once and merges them into every hero instance", async () => {
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
        eventAnimations: {
          attack: {url: "/test/animations/attack.glb", clip: "Attack"},
          spawn: {url: "/test/animations/spawn.glb", clip: "Spawn"},
        },
      },
    },
    load: async url => {
      loads.push(url)
      if (url.endsWith("attack.glb")) {
        return {scene: new THREE.Group(), animations: [new THREE.AnimationClip("Attack", .6, [])]}
      }
      if (url.endsWith("spawn.glb")) {
        return {scene: new THREE.Group(), animations: [new THREE.AnimationClip("Spawn", 1.2, [])]}
      }
      return {scene: template, animations: [new THREE.AnimationClip("Idle", 1, [])]}
    },
  })

  const [first, second] = await Promise.all([
    registry.instantiateHero("TestHero"),
    registry.instantiateHero("TestHero"),
  ])

  assert.deepEqual(loads.sort(), [
    "/test.glb",
    "/test/animations/attack.glb",
    "/test/animations/spawn.glb",
  ])
  assert.deepEqual(first.animations.map(clip => clip.name), ["Idle", "Attack", "Spawn"])
  assert.deepEqual(second.animations.map(clip => clip.name), ["Idle", "Attack", "Spawn"])
})

test("AssetRegistry replaces embedded event clips with the separately authored files", async () => {
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
        eventAnimations: {
          attack: {url: "/test/animations/attack.glb", clip: "Attack"},
          spawn: {url: "/test/animations/spawn.glb", clip: "Spawn"},
        },
      },
    },
    load: async url => {
      loads.push(url)
      if (url.endsWith("attack.glb")) {
        return {scene: new THREE.Group(), animations: [new THREE.AnimationClip("Attack", .8, [])]}
      }
      if (url.endsWith("spawn.glb")) {
        return {scene: new THREE.Group(), animations: [new THREE.AnimationClip("Spawn", 1.4, [])]}
      }
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

  const instance = await registry.instantiateHero("TestHero")

  assert.deepEqual(loads, [
    "/test.glb",
    "/test/animations/attack.glb",
    "/test/animations/spawn.glb",
  ])
  assert.deepEqual(instance.animations.map(clip => clip.name), ["Idle", "Attack", "Spawn"])
  assert.equal(instance.animations.find(clip => clip.name === "Attack").duration, .8)
  assert.equal(instance.animations.find(clip => clip.name === "Spawn").duration, 1.4)
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

test("AssetRegistry preloads every hero model and event animation through the shared cache", async () => {
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
        eventAnimations: {
          idle: {url: "/alpha/idle.glb", clip: "Idle"},
          attack: {url: "/alpha/attack.glb", clip: "Attack"},
        },
      },
    },
    load: async url => {
      loads.push(url)
      return {
        scene: template,
        animations: url === "/alpha.glb" ? [] : [new THREE.AnimationClip("Event", 1, [])],
      }
    },
  })

  await registry.preloadAll(2)
  await registry.instantiateHero("Alpha")

  assert.deepEqual(loads.sort(), ["/alpha.glb", "/alpha/attack.glb", "/alpha/idle.glb"])
})

test("the app starts the shared GLB preload immediately on page load", async () => {
  const source = await readFile(projectFile("src/main.jsx"), "utf8")
  assert.match(source, /assetRegistry\.preloadAll\(/)
  assert.equal(source.indexOf("assetRegistry.preloadAll(") < source.indexOf("createRoot("), true)
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
  body.position.y = 2.5
  const cloud = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100), new THREE.MeshBasicMaterial())
  cloud.position.set(60, 60, 0)
  cloud.userData.attachment_role = "attack-cloud"
  root.add(body, cloud)

  normalizeHeroHeight(root, 2.45)

  const bounds = new THREE.Box3().setFromObject(body)
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
  assert.equal(controller.actions.get("attack").getClip().tracks.length, 3)
  assert.equal(controller.actions.get("attack").getClip().tracks.some(track => /Hips/.test(track.name)), true)
  assert.equal(controller.actions.get("attack").getClip().tracks.some(track => /Foot/.test(track.name)), true)
  assert.equal(controller.overlay, "attack")
  assert.equal(controller.heldProjectile.parent, hand)
  assert.equal(controller.heldProjectile.visible, true)
  assert.equal(controller.actions.get("aim").isRunning(), true)
  assert.equal(controller.aimWeight > 0, true)
  controller.update(.25, {moving: true, aiming: true, speed: 300, referenceSpeed: 240, attackPulse: 1})
  assert.equal(controller.heldProjectile.visible, false)
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

test("hero selection replaces the WebGL canvas when the selected GLB changes", async () => {
  const source = await readFile(projectFile("src/components/HeroSelect/HeroModelPreview.jsx"), "utf8")
  assert.match(source, /key=\{hero\?\.name\}/)
  assert.match(source, /MAX_CARD_PREVIEW_RENDERERS/)
  assert.match(source, /try \{\s*renderer=new THREE\.WebGLRenderer/)
  assert.match(source, /unregisterPreviewRenderer\(renderer\)/)
  assert.match(source, /if\s*\(disposed\|\|renderer\.getContext\(\)\?\.isContextLost\(\)\)return/)
  assert.match(source, /renderer\.forceContextLoss\(\)/)
  assert.match(source, /previewSnapshots/)
  assert.match(source, /canvas\.toDataURL/)
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

test("the fighter roster warms decoded GLBs before it opens", async () => {
  const source = await readFile(projectFile("src/components/HeroSelect/HeroSelect.jsx"), "utf8")
  assert.match(source, /assetRegistry\.preloadHeroes/)
  assert.match(source, /requestIdleCallback/)
})

test("hero equipment profiles hide detached ammo and animate Brock's nearby cloud", () => {
  const mandyRoot = new THREE.Group()
  const mandyWrist = new THREE.Bone()
  mandyWrist.name = "R_wrist_s_064"
  const mandyStaff = new THREE.Group()
  mandyStaff.name = "MandyStaff_Attachment"
  mandyStaff.userData.attachment_role = "melee-weapon"
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
  cloud.userData.attachment_role = "attack-cloud"
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
