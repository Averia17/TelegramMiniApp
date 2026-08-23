const fs = require("node:fs")
const path = require("node:path")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.KATTY_ORIENTATION_QA_URL || "http://127.0.0.1:5173"
const output = path.resolve(__dirname, "../../output/playwright/katty-orientation-compare")

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    fs.mkdirSync(output, {recursive: true})
    const page = await browser.newPage({viewport: {width: 1100, height: 700}, deviceScaleFactor: 1})
    const errors = []
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()) })
    page.on("pageerror", error => errors.push(error.stack || String(error)))
    await page.route("**/api/battle/heroes", route => route.fulfill({json: [{name: "Katty"}]}))
    await page.route("**/api/battle/map-preview", route => route.fulfill({json: {map: {width: 1024, height: 768, tileSize: 40, walls: []}}}))
    await page.goto(`${baseUrl}/test/glb-hero-harness?hero=Katty`, {waitUntil: "domcontentloaded", timeout: 30000})
    await page.waitForFunction(() => Boolean(window.qa?.player && window.qa?.battleRenderer), {timeout: 30000})
    await page.waitForTimeout(1000)
    await page.evaluate(() => {
      window.qa.player.x = 350
      window.qa.player.y = 260
      window.qa.battleRenderer.cameraRig.preferredVertical = 8
      window.qa.battleRenderer.setState(window.qa.battleState)
    })
    for (const [label, rotation] of [["zero", 0], ["pi", Math.PI]]) {
      await page.evaluate(value => { window.qa.getView().model.rotation.y = value }, rotation)
      await page.waitForTimeout(250)
      await page.screenshot({path: path.join(output, `${label}.png`)})
    }
    console.log(JSON.stringify({output, errors}, null, 2))
    if (errors.length) process.exitCode = 1
  },
).catch(error => {
  console.error(error)
  process.exitCode = 1
})
