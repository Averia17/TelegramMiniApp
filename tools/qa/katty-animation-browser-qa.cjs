const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.KATTY_QA_URL || "http://127.0.0.1:5173"
const output = path.resolve(__dirname, "../../output/playwright/katty-animation")
const angleDistance = (left, right) => Math.abs(Math.atan2(
  Math.sin(left - right),
  Math.cos(left - right),
))

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    fs.mkdirSync(output, {recursive: true})
    const page = await browser.newPage({viewport: {width: 1280, height: 900}, deviceScaleFactor: 1})
    const consoleErrors = []
    const pageErrors = []
    page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()) })
    page.on("pageerror", error => pageErrors.push(error.stack || String(error)))
    await page.route("**/api/battle/heroes", route => route.fulfill({json: [{name: "Katty"}]}))
    await page.route("**/api/battle/map-preview", route => route.fulfill({json: {
      map: {width: 1024, height: 768, tileSize: 40, walls: []},
    }}))

    await page.goto(`${baseUrl}/test/glb-hero-harness?hero=Katty`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    })
    await page.waitForFunction(() => document.querySelector("#status")?.classList.contains("ready"), {
      timeout: 30_000,
    })
    await page.waitForTimeout(1600)

    const face = async (moveX, moveY, expectedAngle) => {
      await page.evaluate(([x, y]) => {
        window.qa.player.moveX = x
        window.qa.player.moveY = y
        window.qa.battleRenderer.setState(window.qa.battleState)
      }, [moveX, moveY])
      await page.waitForTimeout(900)
      const angle = await page.evaluate(() => window.qa.getView().model.rotation.y)
      assert.ok(
        angleDistance(angle, expectedAngle) < 0.25,
        `Katty facing ${angle} did not reach ${expectedAngle}`,
      )
      return angle
    }

    const facingAngles = {
      forward: await face(0, 1, 0),
      right: await face(1, 0, Math.PI / 2),
      backward: await face(0, -1, Math.PI),
      left: await face(-1, 0, -Math.PI / 2),
    }

    await face(0, 1, 0)
    await page.evaluate(() => { window.qa.battleRenderer.cameraRig.preferredVertical = 10 })
    await page.locator('[data-animation="idle"]').click()
    await page.locator("#toggle").click()
    await page.waitForTimeout(800)
    const headTiltDegrees = await page.evaluate(() => {
      const view = window.qa.getView()
      const model = view.model
      let head = null
      model.traverse(node => { if (node.name === "head_s") head = node })
      if (!head) throw new Error("Katty GLB is missing head_s")
      model.updateMatrixWorld(true)
      const elements = head.matrixWorld.elements
      const length = Math.hypot(elements[8], elements[9], elements[10])
      const cosine = Math.max(-1, Math.min(1,
        elements[10] / length,
      ))
      return Math.acos(cosine) * 180 / Math.PI
    })
    assert.ok(
      headTiltDegrees < 10,
      `Katty idle head tilt was ${headTiltDegrees}°`,
    )
    await page.screenshot({path: path.join(output, "idle.png")})
    await page.evaluate(() => {
      window.qa.player.attackPulse += 1
      window.qa.battleRenderer.setState(window.qa.battleState)
    })
    await page.waitForTimeout(240)
    await page.screenshot({path: path.join(output, "attack.png")})
    await page.evaluate(() => {
      window.qa.player.gadgetPulse += 1
      window.qa.battleRenderer.setState(window.qa.battleState)
    })
    await page.waitForTimeout(320)
    await page.screenshot({path: path.join(output, "gadget.png")})

    assert.deepEqual(pageErrors, [])
    assert.deepEqual(consoleErrors, [])
    process.stdout.write(JSON.stringify({
      facingAngles,
      headTiltDegrees,
      consoleErrors,
      pageErrors,
      output,
    }, null, 2))
  },
).catch(error => {
  console.error(error)
  process.exitCode = 1
})
