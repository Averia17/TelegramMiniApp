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

    let canonicalMap = null
    for (const pathname of ["/test/map-environment-harness", "/test/map-environment-harness.html"]) {
      await page.goto(`${baseUrl}${pathname}`, {waitUntil: "domcontentloaded", timeout: 30_000})
      await page.waitForFunction(() => document.querySelector("#status")?.classList.contains("is-ready"), {timeout: 30_000})
      assert.equal(await page.title(), "Проверка боевой карты")
      const snapshot = await page.evaluate(() => JSON.parse(window.render_game_to_text()))
      assert.equal(snapshot.renderer, "ThreeBattleRenderer")
      assert.equal(snapshot.map.seed, 20260810)
      assert.equal(snapshot.map.id, "battle-royale@20260827")
      canonicalMap = snapshot.map
      assert.equal(snapshot.environment.ready, true)
      const zoomBefore = await page.locator("#zoom-value").innerText()
      await page.locator("#scene").hover()
      await page.mouse.wheel(0, -240)
      await page.waitForFunction(previous => document.querySelector("#zoom-value")?.textContent !== previous, zoomBefore)
      assert.notEqual(await page.locator("#zoom-value").innerText(), zoomBefore)
    }

    await page.goto(`${baseUrl}/test/glb-hero-harness`, {waitUntil: "domcontentloaded", timeout: 30_000})
    await page.waitForFunction(() => document.querySelector("#status")?.classList.contains("ready"), {timeout: 30_000})
    const heroSnapshot = await page.evaluate(() => JSON.parse(window.render_game_to_text()))
    assert.deepEqual(heroSnapshot.map, {
      id: canonicalMap.id,
      name: canonicalMap.name,
      seed: canonicalMap.seed,
      revision: canonicalMap.revision,
      walls: canonicalMap.walls,
      water: canonicalMap.water,
    })
    const heroZoomBefore = await page.locator("#zoom-value").innerText()
    await page.mouse.move(700, 700)
    await page.mouse.wheel(0, -240)
    await page.waitForFunction(previous => document.querySelector("#zoom-value")?.textContent !== previous, heroZoomBefore)
    assert.notEqual(await page.locator("#zoom-value").innerText(), heroZoomBefore)

    await page.goto(`${baseUrl}/test/map-environment-harness`, {waitUntil: "domcontentloaded", timeout: 30_000})
    await page.waitForFunction(() => document.querySelector("#status")?.classList.contains("is-ready"), {timeout: 30_000})

    await page.locator('[data-zone="north"]').click()
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).hero.y < 500)
    await page.keyboard.press("KeyD")
    assert.match(await page.locator("#position").innerText(), /^\d+, \d+$/)
    const beforeDrag = await page.evaluate(() => JSON.parse(window.render_game_to_text()))
    await page.mouse.move(360, 500)
    await page.mouse.down()
    await page.mouse.move(520, 610, {steps: 6})
    await page.mouse.up()
    await page.waitForFunction(
      target => JSON.stringify(JSON.parse(window.render_game_to_text()).camera.target) !== JSON.stringify(target),
      beforeDrag.camera.target,
    )
    const afterDrag = await page.evaluate(() => JSON.parse(window.render_game_to_text()))
    assert.deepEqual(afterDrag.hero, beforeDrag.hero)
    assert.notDeepEqual(afterDrag.camera.target, beforeDrag.camera.target)
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
