const fs = require("node:fs")
const path = require("node:path")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.FAIRY_ARM_QA_URL || "http://127.0.0.1:5173"
const output = path.resolve(__dirname, "../../output/playwright/fairy-arm-closeup")

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    fs.mkdirSync(output, {recursive: true})
    const page = await browser.newPage({viewport: {width: 1100, height: 900}, deviceScaleFactor: 1})
    const errors = []
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()) })
    page.on("pageerror", error => errors.push(error.stack || String(error)))
    await page.route("**/api/battle/heroes", route => route.fulfill({json: [{name: "Fairy Mina"}]}))
    await page.route("**/api/battle/map-preview", route => route.fulfill({json: {map: {width: 1024, height: 768, tileSize: 40, walls: []}}}))
    await page.goto(`${baseUrl}/test/glb-hero-harness?hero=Fairy%20Mina`, {waitUntil: "domcontentloaded", timeout: 30000})
    await page.waitForFunction(() => Boolean(window.qa?.player && window.qa?.battleRenderer && window.qa?.getView()?.animation), {timeout: 30000})
    await page.waitForTimeout(500)
    await page.evaluate(() => {
      window.qa.player.x = 350
      window.qa.player.y = 260
      window.qa.battleRenderer.cameraRig.preferredVertical = 5.4
      window.qa.battleRenderer.setState(window.qa.battleState)
      document.querySelector("button")?.focus()
    })
    const scenes = [
      ["idle", () => window.qa.getView().animation.transitionLocomotion("idle", 0)],
      ["attack", () => window.qa.getView().animation.playSafe("attack", "idle", 0)],
      ["super", () => window.qa.getView().animation.playSafe("super", "idle", 0)],
      ["gadget", () => window.qa.getView().animation.playSafe("gadget", "idle", 0)],
    ]
    for (const [name] of scenes) {
      await page.evaluate(name => {
        const animation = window.qa.getView().animation
        if (name === "idle") animation.transitionLocomotion("idle", 0)
        else animation.playSafe(name, "idle", 0)
        window.qa.battleRenderer.setState(window.qa.battleState)
      }, name)
      await page.waitForTimeout(name === "idle" ? 700 : 320)
      await page.screenshot({path: path.join(output, `${name}.png`)})
    }
    console.log(JSON.stringify({errors, output}, null, 2))
    if (errors.length) process.exitCode = 1
  },
).catch(error => {
  console.error(error)
  process.exitCode = 1
})
