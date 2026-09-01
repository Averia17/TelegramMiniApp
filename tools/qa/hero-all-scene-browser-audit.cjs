const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.HERO_ALL_SCENE_QA_URL || "http://127.0.0.1:5173"
const output = path.resolve(__dirname, "../../output/playwright/hero-all-scene-audit")
const heroes = (process.env.HERO_ALL_SCENE_QA_HEROES || "Mandy,Kaze,Wukong Mico,Needle,Fairy Mina,Persephone Lumi,Brock Zeus,Katty").split(",")
const extras = new Set(["Mandy", "Kaze", "Needle", "Fairy Mina", "Brock Zeus"])
const clips = ["idle", "run", "attack", "super", "gadget", "aim", "aim-super", "hit", "death", "spawn", "victory", "stunned"]
const sceneClips = hero => extras.has(hero) ? [...clips, "aim-gadget"] : clips
const runtimeName = clip => ({"aim-super": "aimSuper", "aim-gadget": "aimGadget", death: "defeat"}[clip] || clip)
const slug = value => value.toLowerCase().replaceAll(" ", "-")

async function resetController(page) {
  await page.evaluate(() => {
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
    player.stun = 0
    player.channel = 0
    window.qa.battleRenderer.setState(window.qa.battleState)
  })
  await page.waitForTimeout(100)
}

async function playScene(page, hero, clip) {
  const name = runtimeName(clip)
  await resetController(page)
  const duration = await page.evaluate(({clip, name}) => {
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
    } else if (clip === "stunned") {
      player.stun = 3
    } else {
      controller.playSafe(name, "idle", 0)
    }
    window.qa.battleRenderer.setState(window.qa.battleState)
    return action.getClip().duration
  }, {clip, name})
  assert.ok(duration !== null, `missing runtime action ${name}`)
  const loop = clip === "idle" || clip === "run" || clip.startsWith("aim") || clip === "victory" || clip === "death" || clip === "stunned"
  const waitTimes = loop
    ? [180, 600, 980]
    : [Math.max(80, duration * 1000 * .08), Math.max(180, duration * 1000 * .52), Math.max(280, duration * 1000 * .88)]
  const frames = []
  for (const [phase, wait] of [["start", waitTimes[0]], ["mid", waitTimes[1]], ["end", waitTimes[2]]]) {
    await page.waitForTimeout(wait)
    const file = path.join(output, slug(hero), `${clip}-${phase}.png`)
    fs.mkdirSync(path.dirname(file), {recursive: true})
    await page.screenshot({path: file})
    frames.push(file)
  }
  return {clip, duration, frames}
}

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    fs.mkdirSync(output, {recursive: true})
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
        await page.waitForTimeout(300)
        await page.evaluate(() => {
          window.qa.player.x = 350
          window.qa.player.y = 260
          window.qa.battleRenderer.cameraRig.preferredVertical = 9
          window.qa.battleRenderer.setState(window.qa.battleState)
        })
        const available = await page.evaluate(() => [...window.qa.getView().animation.actions.keys()])
        const expected = sceneClips(hero).map(runtimeName)
        for (const name of expected) assert.ok(available.includes(name), `${hero}: runtime action ${name} missing`)
        for (const clip of sceneClips(hero)) results.push({...await playScene(page, hero, clip), hero})
      } catch (error) {
        errors.push(`${hero}: ${error.stack || error}`)
      } finally {
        await page.close()
      }
    }
    console.log(JSON.stringify({heroes: heroes.length, scenes: results.length, frames: results.length * 3, errors, output}, null, 2))
    if (errors.length) process.exitCode = 1
  },
  {maxRuntimeMs: 420000},
).catch(error => {
  console.error(error)
  process.exitCode = 1
})
