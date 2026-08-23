const fs = require("node:fs")
const path = require("node:path")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.KATTY_GRIP_QA_URL || "http://127.0.0.1:5173"
const output = path.resolve(__dirname, "../../output/playwright/katty-grip.png")

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    const page = await browser.newPage({viewport: {width: 1100, height: 900}, deviceScaleFactor: 1})
    const errors = []
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()) })
    page.on("pageerror", error => errors.push(error.stack || String(error)))
    await page.route("**/api/battle/heroes", route => route.fulfill({json: [{name: "Katty"}]}))
    await page.route("**/api/battle/map-preview", route => route.fulfill({json: {map: {width: 1024, height: 768, tileSize: 40, walls: []}}}))
    await page.goto(`${baseUrl}/test/glb-hero-harness?hero=Katty`, {waitUntil: "domcontentloaded", timeout: 30000})
    await page.waitForFunction(() => Boolean(window.qa?.getView()?.animation), {timeout: 30000})
    await page.waitForTimeout(900)
    await page.evaluate(() => { window.qa.player.x = 350; window.qa.player.y = 260; window.qa.battleRenderer.cameraRig.preferredVertical = 8 })
    await page.waitForTimeout(300)
    const positions = await page.evaluate(() => {
      const view = window.qa.getView()
      const controller = view.animation
      const names = ["bottle_s", "R_wrist_s", "R_index_01_s", "R_middle_01_s", "R_thumb_01_s", "L_wrist_s", "L_index_01_s", "L_middle_01_s", "L_thumb_01_s", "L_elbow_s", "R_elbow_s"]
      view.model.updateMatrixWorld(true)
      return {rotation: view.model.rotation.y, orientationOffset: view.orientationOffset, positions: Object.fromEntries(names.map(name => {
        const node = view.model.getObjectByName(name)
        const matrix = node?.matrixWorld?.elements
        return [name, matrix ? [matrix[12], matrix[13], matrix[14]] : null]
      }))}
    })
    fs.mkdirSync(path.dirname(output), {recursive: true})
    await page.screenshot({path: output})
    console.log(JSON.stringify({positions, errors, output}, null, 2))
    if (errors.length) process.exitCode = 1
  },
).catch(error => {
  console.error(error)
  process.exitCode = 1
})
