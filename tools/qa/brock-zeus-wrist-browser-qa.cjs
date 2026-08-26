const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.BROCK_ZEUS_QA_URL || "http://localhost"
const output = path.resolve(__dirname, "../../output/playwright/brock-zeus-wrist")

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    fs.mkdirSync(output, {recursive: true})
    const page = await browser.newPage({viewport: {width: 800, height: 800}, deviceScaleFactor: 1})
    const errors = []
    page.on("pageerror", error => errors.push(error.stack || String(error)))
    await page.goto(`${baseUrl}/test/glb-hero-harness.html?hero=Brock+Zeus`, {waitUntil: "domcontentloaded", timeout: 30000})
    await page.waitForFunction(() => Boolean(window.qa?.getView?.()?.animation), {timeout: 30000})
    await page.waitForFunction(() => window.qa.getView().animation.state !== "spawn", {timeout: 5000})
    await page.evaluate(() => {
      window.qa.player.x = 350
      window.qa.player.y = 260
      window.qa.battleRenderer.cameraRig.preferredVertical = 4
      window.qa.battleRenderer.setState(window.qa.battleState)
    })
    await page.locator('[data-animation="idle"]').click()
    await page.waitForTimeout(250)
    await page.locator("#toggle").click()
    await page.waitForTimeout(100)
    await page.screenshot({path: path.join(output, "idle-close.png")})
    const runtime = await page.evaluate(async () => {
      const THREE = await import("/node_modules/three/build/three.module.js")
      const root = window.qa.getView().model
      root.updateMatrixWorld(true)
      const nodes = []
      root.traverse(node => {
        if (!node.isMesh) return
        const bounds = new THREE.Box3().setFromObject(node)
        nodes.push({name: node.name, parent: node.parent?.name || null, min: bounds.min.toArray(), max: bounds.max.toArray()})
      })
      return {state: window.qa.getView().animation.state, nodes}
    })
    assert.equal(errors.length, 0, errors.join("\n"))
    console.log(JSON.stringify({output, runtime, errors}))
    await page.close()
  },
).catch(error => {
  console.error(error)
  process.exitCode = 1
})
