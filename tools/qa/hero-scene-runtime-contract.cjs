const assert = require("node:assert/strict")
const path = require("node:path")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.HERO_RUNTIME_QA_URL || "http://127.0.0.1:5173"
const heroes = (process.env.HERO_RUNTIME_QA_HEROES || "Mandy,Kaze,Wukong Mico,Needle,Fairy Mina,Persephone Lumi,Brock Zeus,Katty").split(",")
const extras = new Set(["Mandy", "Kaze", "Needle", "Fairy Mina", "Brock Zeus"])
const clips = ["idle", "run", "attack", "super", "gadget", "aim", "aim-super", "hit", "death", "spawn", "victory"]
const runtimeName = clip => ({"aim-super": "aimSuper", "aim-gadget": "aimGadget", death: "defeat"}[clip] || clip)
const sceneClips = hero => extras.has(hero) ? [...clips, "aim-gadget"] : clips

const reset = page => page.evaluate(() => {
  const player = window.qa.player
  const controller = window.qa.getView().animation
  for (const action of controller.actions.values()) action.stop().setEffectiveWeight(0)
  controller.state = null
  controller.overlay = null
  controller.locomotionSuppressed = false
  controller.root.visible = true
  controller.root.scale.copy(controller.spawnScale)
  controller.root.position.copy(controller.basePosition)
  player.lives = player.maxLives
  player.moveX = 0
  player.moveY = 0
  player.aiming = false
  player.channel = 0
  window.qa.battleRenderer.setState(window.qa.battleState)
})

async function play(page, clip) {
  const name = runtimeName(clip)
  const state = await page.evaluate(({clip, name}) => {
    const player = window.qa.player
    const controller = window.qa.getView().animation
    const action = controller.actions.get(name)
    if (!action) return null
    if (clip === "idle" || clip === "run") {
      controller.transitionLocomotion(clip, 0)
      player.moveY = clip === "run" ? 1 : 0
    } else if (clip === "aim") {
      player.aiming = true
      controller.transitionLocomotion("idle", 0)
    } else if (clip === "aim-super") {
      player.channel = 1
      controller.transitionLocomotion("idle", 0)
    } else if (clip === "aim-gadget") {
      controller.playOverlay("aimGadget", 0)
    } else if (clip === "spawn") {
      controller.playSpawn()
    } else if (clip === "death") {
      controller.playOutcome("defeat", 0)
    } else if (clip === "victory") {
      controller.playOutcome("victory", 0)
    } else {
      controller.playSafe(name, "idle", 0)
    }
    window.qa.battleRenderer.setState(window.qa.battleState)
    return {state: controller.state, overlay: controller.overlay, actionRunning: action.isRunning(), actionWeight: action.getEffectiveWeight()}
  }, {clip, name})
  assert.ok(state, `${name} action missing`)
  await page.waitForTimeout(40)
  const after = await page.evaluate(({name}) => {
    const controller = window.qa.getView().animation
    const action = controller.actions.get(name)
    return {state: controller.state, overlay: controller.overlay, actionRunning: action.isRunning(), actionTime: action.time, actionWeight: action.getEffectiveWeight()}
  }, {name})
  assert.ok(after.actionRunning || after.actionWeight > 0.01, `${clip}: ${name} did not become active`)
  return {clip, name, ...state, after}
}

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    const errors = []
    const results = []
    for (const hero of heroes) {
      const page = await browser.newPage({viewport: {width: 1100, height: 900}, deviceScaleFactor: 1})
      page.on("console", message => { if (message.type() === "error") errors.push(`${hero}: ${message.text()}`) })
      page.on("pageerror", error => errors.push(`${hero}: ${error.stack || error}`))
      try {
        await page.route("**/api/battle/heroes", route => route.fulfill({json: [{name: hero}]}))
        await page.route("**/api/battle/map-preview", route => route.fulfill({json: {map: {width: 1024, height: 768, tileSize: 40, walls: []}}}))
        await page.goto(`${baseUrl}/test/glb-hero-harness?hero=${encodeURIComponent(hero)}`, {waitUntil: "domcontentloaded", timeout: 30000})
        await page.waitForFunction(() => Boolean(window.qa?.player && window.qa?.battleRenderer && window.qa?.getView()?.animation), {timeout: 30000})
        await page.evaluate(() => { window.qa.player.x = 350; window.qa.player.y = 260; window.qa.battleRenderer.setState(window.qa.battleState) })
        for (const clip of sceneClips(hero)) {
          await reset(page)
          results.push({hero, ...(await play(page, clip))})
        }
      } catch (error) {
        errors.push(`${hero}: ${error.stack || error}`)
      } finally {
        await page.close()
      }
    }
    console.log(JSON.stringify({heroes: heroes.length, scenes: results.length, errors, results}, null, 2))
    if (errors.length) process.exitCode = 1
  },
  {maxRuntimeMs: 180000},
).catch(error => {
  console.error(error)
  process.exitCode = 1
})
