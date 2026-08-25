const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.MAP_QA_URL || "http://localhost"
const output = path.resolve(__dirname, "../../output/playwright/abandoned-city-map")

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    fs.mkdirSync(output, {recursive: true})
    const page = await browser.newPage({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1})
    const consoleErrors = []
    const pageErrors = []
    page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()) })
    page.on("pageerror", error => pageErrors.push(error.stack || String(error)))

    await page.goto(`${baseUrl}/test/map-environment-harness.html?mode=team`, {waitUntil: "domcontentloaded", timeout: 30_000})
    await page.waitForFunction(() => document.querySelector("#status")?.classList.contains("is-ready"), {timeout: 30_000})

    const snapshot = await page.evaluate(() => ({
      text: JSON.parse(window.render_game_to_text()),
      featureTypes: window.qa.map.features.map(feature => feature.type),
      cityFeatures: window.qa.map.features.filter(feature => feature.type.startsWith("city_")).length,
      cityWalls: window.qa.map.walls.filter(wall => wall.type === "building_wall").length,
      rubble: window.qa.map.walls.filter(wall => wall.type === "building_rubble").length,
      collisionConflicts: (() => {
        const cells = new Set()
        const conflicts = new Set()
        for (const wall of window.qa.map.walls) {
          const cell = `${Math.floor(wall.minX / 40)}:${Math.floor(wall.minY / 40)}`
          if (cells.has(cell)) conflicts.add(cell)
          cells.add(cell)
        }
        return conflicts.size
      })(),
      cityPlazaWaterOverlap: (() => {
        const plaza = window.qa.map.features.find(feature => feature.type === "city_plaza")
        if (!plaza) return 0
        const cell = `${Math.floor(plaza.x / 40)}:${Math.floor(plaza.y / 40)}`
        return window.qa.map.walls.filter(wall => {
          const wallCell = `${Math.floor(wall.minX / 40)}:${Math.floor(wall.minY / 40)}`
          return wallCell === cell && ["water", "river", "river_bridge"].includes(wall.type)
        }).length
      })(),
    }))
    assert.equal(snapshot.text.map.id, "team-battle@20260816")
    assert.equal(snapshot.text.environment.ready, true)
    assert.ok(snapshot.cityFeatures >= 11, `expected city features, got ${snapshot.cityFeatures}`)
    assert.ok(snapshot.cityWalls >= 36, `expected building walls, got ${snapshot.cityWalls}`)
    assert.ok(snapshot.rubble >= 12, `expected building rubble, got ${snapshot.rubble}`)
    assert.equal(snapshot.collisionConflicts, 0, `found duplicate collision cells: ${snapshot.collisionConflicts}`)
    assert.equal(snapshot.cityPlazaWaterOverlap, 0, `plaza overlaps water/bridge in ${snapshot.cityPlazaWaterOverlap} cells`)
    assert.ok(snapshot.text.environment.features >= 11)

    await page.screenshot({path: path.join(output, "team-desktop.png"), fullPage: true})
    await page.evaluate(() => window.qa.updatePosition(520, 2080, "city"))
    await page.waitForTimeout(250)
    await page.screenshot({path: path.join(output, "city-depot-close.png"), fullPage: true})
    await page.evaluate(() => window.qa.updatePosition(880, 1800, "city-street"))
    await page.waitForTimeout(250)
    await page.screenshot({path: path.join(output, "city-street-close.png"), fullPage: true})
    await page.evaluate(() => window.qa.updatePosition(1680, 1920, "city-plaza"))
    await page.waitForTimeout(250)
    await page.screenshot({path: path.join(output, "city-plaza-close.png"), fullPage: true})
    await page.setViewportSize({width: 390, height: 844})
    await page.screenshot({path: path.join(output, "team-mobile.png"), fullPage: true})
    assert.deepEqual(pageErrors, [])
    assert.deepEqual(consoleErrors, [])
    process.stdout.write(JSON.stringify({snapshot, consoleErrors, pageErrors, output}, null, 2))
  },
).catch(error => {
  console.error(error)
  process.exitCode = 1
})
