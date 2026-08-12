const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.MAP_QA_URL || "http://localhost"
const output = path.resolve(__dirname, "../../output/playwright/map-environment")

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    fs.mkdirSync(output, {recursive: true})
    const page = await browser.newPage({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1})
    const consoleErrors = []
    const pageErrors = []
    page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()) })
    page.on("pageerror", error => pageErrors.push(error.stack || String(error)))

    for (const pathname of ["/test/map-environment-harness", "/test/map-environment-harness.html"]) {
      await page.goto(`${baseUrl}${pathname}`, {waitUntil: "domcontentloaded", timeout: 30_000})
      await page.waitForFunction(() => document.querySelector("#status")?.classList.contains("is-ready"), {timeout: 30_000})
      assert.equal(await page.title(), "Проверка боевой карты")
      const snapshot = await page.evaluate(() => JSON.parse(window.render_game_to_text()))
      assert.equal(snapshot.renderer, "ThreeBattleRenderer")
      assert.equal(snapshot.map.seed, 20260810)
      assert.equal(snapshot.environment.ready, true)
    }

    await page.locator('[data-zone="north"]').click()
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).hero.y < 500)
    await page.keyboard.press("KeyD")
    assert.match(await page.locator("#position").innerText(), /^\d+, \d+$/)
    await page.locator("#toggle-panel").click()
    assert.equal(await page.locator("#toggle-panel").getAttribute("aria-expanded"), "false")
    await page.locator("#toggle-panel").click()
    await page.screenshot({path: path.join(output, "desktop.png"), fullPage: true})

    await page.setViewportSize({width: 390, height: 844})
    await page.screenshot({path: path.join(output, "mobile.png"), fullPage: true})
    assert.deepEqual(pageErrors, [])
    assert.deepEqual(consoleErrors, [])
    process.stdout.write(JSON.stringify({consoleErrors, pageErrors, output}, null, 2))
  },
).catch(error => {
  console.error(error)
  process.exitCode = 1
})
