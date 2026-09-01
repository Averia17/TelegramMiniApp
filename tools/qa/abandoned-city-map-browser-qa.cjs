const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.MAP_QA_URL || "http://localhost"
const selectedMap = process.env.MAP_QA_MAP === "team-battle" ? "team-battle" : "team-battle-northern"
const expectedMapId = selectedMap === "team-battle" ? "team-battle@20260816" : "team-battle-northern@20260827"
const output = path.resolve(__dirname, "../../output/playwright/abandoned-city-map", selectedMap)

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    fs.mkdirSync(output, {recursive: true})
    const page = await browser.newPage({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1})
    const consoleErrors = []
    const pageErrors = []
    page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()) })
    page.on("pageerror", error => pageErrors.push(error.stack || String(error)))

    await page.goto(`${baseUrl}/test/map-environment-harness.html?mode=team&map=${selectedMap}`, {waitUntil: "domcontentloaded", timeout: 30_000})
    await page.waitForFunction(() => document.querySelector("#status")?.classList.contains("is-ready"), {timeout: 30_000})

    const snapshot = await page.evaluate(() => ({
      text: JSON.parse(window.render_game_to_text()),
      featureTypes: window.qa.map.features.map(feature => feature.type),
      cityFeatures: window.qa.map.features.filter(feature => feature.type.startsWith("city_")).length,
      cityGuildhalls: window.qa.map.features.filter(feature => feature.id.startsWith("city-guildhall")).length,
      dockWarehouses: window.qa.map.features.filter(feature => feature.id.startsWith("city-dock-warehouse")).length,
      northTownhouses: window.qa.map.features.filter(feature => feature.id.startsWith("city-north-townhouses")).length,
      dockYards: window.qa.map.features.filter(feature => feature.type === "city_dockyard").length,
      cityLanes: window.qa.map.features.filter(feature => feature.type === "city_lane").length,
      castleHouses: window.qa.map.features.filter(feature => feature.type === "castle_house").length,
      castleCourtyards: window.qa.map.features.filter(feature => feature.type === "castle_courtyard").length,
      cityWalls: window.qa.map.walls.filter(wall => wall.type === "building_wall").length,
      rubble: window.qa.map.walls.filter(wall => wall.type === "building_rubble").length,
      collisionConflicts: (() => {
        const cells = new Map()
        const conflicts = new Set()
        for (const wall of window.qa.map.walls) {
          const cell = `${Math.floor(wall.minX / 40)}:${Math.floor(wall.minY / 40)}`
          const previous = cells.get(cell)
          // Fine-grained city_object colliders can share a coarse 40px bucket;
          // only unrelated gameplay blockers are a real map conflict.
          if (previous && wall.type !== "city_object" && previous.type !== "city_object") conflicts.add(cell)
          cells.set(cell, wall)
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
    assert.equal(snapshot.text.map.id, expectedMapId)
    assert.equal(snapshot.text.environment.ready, true)
    assert.ok(snapshot.cityFeatures >= 11, `expected city features, got ${snapshot.cityFeatures}`)
    if (selectedMap === "team-battle-northern") assert.equal(snapshot.cityGuildhalls, 2, `expected two mirrored guildhalls, got ${snapshot.cityGuildhalls}`)
    if (selectedMap === "team-battle-northern") assert.equal(snapshot.dockWarehouses, 2, `expected two mirrored dock warehouses, got ${snapshot.dockWarehouses}`)
    if (selectedMap === "team-battle-northern") assert.equal(snapshot.northTownhouses, 2, `expected two mirrored north townhouse rows, got ${snapshot.northTownhouses}`)
    if (selectedMap === "team-battle-northern") assert.equal(snapshot.dockYards, 2, `expected two mirrored dockyards, got ${snapshot.dockYards}`)
    if (selectedMap === "team-battle-northern") assert.equal(snapshot.cityLanes, 2, `expected two mirrored guildhall/plaza lanes, got ${snapshot.cityLanes}`)
    if (selectedMap === "team-battle-northern") assert.equal(snapshot.castleCourtyards, 2, `expected two mirrored castle courtyards, got ${snapshot.castleCourtyards}`)
    assert.equal(snapshot.castleHouses, 8, `expected eight detailed castle-house landmarks, got ${snapshot.castleHouses}`)
    assert.ok(snapshot.cityWalls >= 36, `expected building walls, got ${snapshot.cityWalls}`)
    if (selectedMap === "team-battle") {
      assert.ok(snapshot.rubble >= 12, `expected classic-map building rubble, got ${snapshot.rubble}`)
    } else {
      assert.equal(snapshot.rubble, 0, `expected the northern city to keep only structural buildings, got ${snapshot.rubble} rubble cells`)
    }
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
    await page.evaluate(() => window.qa.updatePosition(1320, 1880, "city-guildhall"))
    await page.waitForTimeout(250)
    await page.screenshot({path: path.join(output, "city-guildhall-close.png"), fullPage: true})
    await page.evaluate(() => window.qa.updatePosition(1440, 1880, "city-lane"))
    await page.waitForTimeout(250)
    await page.screenshot({path: path.join(output, "city-lane-close.png"), fullPage: true})
    await page.evaluate(() => window.qa.updatePosition(1000, 1820, "castle-courtyard"))
    await page.waitForTimeout(250)
    await page.screenshot({path: path.join(output, "castle-courtyard-close.png"), fullPage: true})
    await page.evaluate(() => window.qa.updatePosition(2080, 1740, "harbour-avenue"))
    await page.waitForTimeout(250)
    await page.screenshot({path: path.join(output, "harbour-avenue-close.png"), fullPage: true})
    await page.evaluate(() => window.qa.updatePosition(2400, 1960, "dock-warehouse"))
    await page.waitForTimeout(250)
    await page.screenshot({path: path.join(output, "dock-warehouse-close.png"), fullPage: true})
    await page.evaluate(() => window.qa.updatePosition(2300, 1880, "dockyard"))
    await page.waitForTimeout(250)
    await page.screenshot({path: path.join(output, "dockyard-close.png"), fullPage: true})
    await page.evaluate(() => window.qa.updatePosition(680, 1240, "north-townhouses"))
    await page.waitForTimeout(250)
    await page.screenshot({path: path.join(output, "north-townhouses-close.png"), fullPage: true})
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
