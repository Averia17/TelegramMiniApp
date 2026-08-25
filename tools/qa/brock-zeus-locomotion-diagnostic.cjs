const assert = require("node:assert/strict")
const {chromium} = require("../../frontend/node_modules/playwright")
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.BROCK_ZEUS_QA_URL || "http://localhost"

const sampleController = name => {
  const view = window.qa.getView()
  const controller = view?.animation
  const action = controller?.actions.get(name)
  const hand = view?.model?.getObjectByName("R_Hand")
  const knee = view?.model?.getObjectByName("L_Knee")
  return {
    state: controller?.state || null,
    overlay: controller?.overlay || null,
    running: Boolean(action?.isRunning()),
    time: action?.time ?? null,
    weight: action?.getEffectiveWeight?.() ?? null,
    handQuaternion: hand ? [hand.quaternion.x, hand.quaternion.y, hand.quaternion.z, hand.quaternion.w] : null,
    kneeQuaternion: knee ? [knee.quaternion.x, knee.quaternion.y, knee.quaternion.z, knee.quaternion.w] : null,
  }
}

const range = values => Math.max(...values) - Math.min(...values)
const quaternionRange = samples => Math.max(
  ...samples.flatMap(sample => sample.handQuaternion || []).map(value => Number(value)),
) - Math.min(
  ...samples.flatMap(sample => sample.handQuaternion || []).map(value => Number(value)),
)

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    const page = await browser.newPage({viewport: {width: 1280, height: 900}})
    const errors = []
    page.on("pageerror", error => errors.push(error.stack || String(error)))
    await page.goto(`${baseUrl}/test/glb-hero-harness.html?hero=Brock+Zeus`, {waitUntil: "domcontentloaded", timeout: 30000})
    await page.waitForFunction(() => Boolean(window.qa?.getView?.()?.animation), {timeout: 30000})
    await page.waitForFunction(
      () => window.qa.getView().animation.state !== "spawn",
      {timeout: 5000},
    )

    const capture = async (selector, actionName, moving = false) => {
      await page.locator(selector).click()
      await page.evaluate(value => {
        window.qa.player.moveY = value ? 1 : 0
        window.qa.battleRenderer.setState(window.qa.battleState)
      }, moving)
      const samples = []
      for (let index = 0; index < 8; index += 1) {
        await page.waitForTimeout(100)
        samples.push(await page.evaluate(sampleController, actionName))
      }
      return samples
    }

    const idle = await capture('[data-animation="idle"]', "idle", false)
    const run = await capture('[data-animation="run"]', "run", true)
    const attack = await capture('[data-skill="attack"]', "attack", false)
    const report = {
      idle: {timeRange: range(idle.map(sample => sample.time)), handQuaternionRange: quaternionRange(idle), samples: idle},
      run: {timeRange: range(run.map(sample => sample.time)), handQuaternionRange: quaternionRange(run), samples: run},
      attack: {timeRange: range(attack.map(sample => sample.time)), handQuaternionRange: quaternionRange(attack), samples: attack},
      errors,
    }
    console.log(JSON.stringify(report))
    assert.equal(errors.length, 0, errors.join("\n"))
    assert.ok(report.idle.timeRange > 0.1, "idle action time does not advance")
    assert.ok(report.run.timeRange > 0.1, "run action time does not advance")
    assert.ok(report.attack.timeRange > 0.1, "attack action time does not advance")
    assert.ok(report.idle.handQuaternionRange > 0.0001, "idle hand pose is static")
    assert.ok(report.run.handQuaternionRange > 0.0001, "run hand pose is static")
  },
).catch(error => {
  console.error(error)
  process.exitCode = 1
})
