const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const {chromium} = require("../../frontend/node_modules/playwright")
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.BROCK_ZEUS_QA_URL || "http://localhost"
const output = path.resolve(__dirname, "../../output/playwright/brock-zeus-visual-audit")

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    fs.mkdirSync(output, {recursive: true})
    const page = await browser.newPage({viewport: {width: 1280, height: 900}, deviceScaleFactor: 1})
    const errors = []
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()) })
    page.on("pageerror", error => errors.push(error.stack || String(error)))
    await page.goto(`${baseUrl}/test/glb-hero-harness.html?hero=Brock+Zeus`, {waitUntil: "domcontentloaded", timeout: 30000})
    await page.waitForFunction(() => Boolean(window.qa?.getView?.()?.animation), {timeout: 30000})
    await page.waitForFunction(() => window.qa.getView().animation.state !== "spawn", {timeout: 5000})
    await page.evaluate(() => {
      window.qa.player.x = 350
      window.qa.player.y = 260
      window.qa.battleRenderer.cameraRig.preferredVertical = 9
      window.qa.battleRenderer.setState(window.qa.battleState)
    })
    await page.waitForTimeout(220)
    await page.locator('[data-animation="idle"]').click()
    await page.waitForTimeout(280)
    await page.screenshot({path: path.join(output, "idle.png")})
    await page.locator('[data-skill="attack"]').click()
    await page.waitForTimeout(420)
    await page.screenshot({path: path.join(output, "attack-release.png")})
    await page.waitForTimeout(300)
    await page.screenshot({path: path.join(output, "attack-recovery.png")})
    const state = await page.evaluate(() => {
      const view = window.qa.getView()
      const controller = view.animation
      const cloud = controller.cloud
      return {
        state: controller.state,
        overlay: controller.overlay,
        cloud: cloud?.name || null,
        cloudState: controller.cloudState,
        actions: [...controller.actions.keys()],
        cloudActions: [...controller.cloudActions.keys()],
      }
    })
    assert.equal(errors.length, 0, errors.join("\n"))
    assert.equal(state.cloud, "Cloud")
    assert.ok(state.actions.includes("attack"))
    assert.ok(state.cloudActions.includes("attack"))
    console.log(JSON.stringify({output, state, errors}, null, 2))
  },
).catch(error => {
  console.error(error)
  process.exitCode = 1
})
