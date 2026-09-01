const assert = require("node:assert/strict")
const path = require("node:path")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.MAP_EDITOR_QA_URL || "http://localhost"
const output = path.resolve(__dirname, "../../output/playwright/map-editor-browser-qa.png")

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    const page = await browser.newPage({viewport: {width: 1440, height: 960}})
    const consoleErrors = []
    const pageErrors = []
    page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()) })
    page.on("pageerror", error => pageErrors.push(error.stack || String(error)))
    await page.route("**/api/battle/map-editor/apply", route => route.fulfill({json: {ok: true, map: "team-battle-northern", path: "model/gamemap/edited_team_battle_northern_map.go"}}))
    await page.addInitScript(() => localStorage.clear())
    await page.goto(`${baseUrl}/test/map-environment-harness.html?mode=team&map=team-battle-northern`, {waitUntil: "commit", timeout: 30000})
    await page.locator("#status.is-ready").waitFor({timeout: 30000})

    await page.locator("#editor-mode").click()
    assert.equal(await page.locator("#editor-controls").isHidden(), false)
    const initialWalls = await page.evaluate(() => window.qa.map.walls.length)
    const initialFeatures = await page.evaluate(() => window.qa.map.features.length)

    const linkedFeaturePick = await page.evaluate(() => {
      const feature = window.qa.map.features.find(candidate => candidate.type === "base_compound")
      const linkedWalls = window.qa.map.walls.filter(wall => wall.linkedFeatureId === feature?.id)
      const minX = Math.min(...linkedWalls.map(wall => wall.minX))
      const maxX = Math.max(...linkedWalls.map(wall => wall.maxX))
      const minY = Math.min(...linkedWalls.map(wall => wall.minY))
      const maxY = Math.max(...linkedWalls.map(wall => wall.maxY))
      const candidates = [
        {x: maxX - 8, y: feature.y},
        {x: feature.x, y: minY + 8},
        {x: minX + 8, y: feature.y},
        {x: feature.x, y: maxY - 8},
      ]
      const point = candidates
        .map(candidate => ({candidate, screen: window.qa.battleRenderer.worldToScreen(candidate.x, candidate.y)}))
        .find(({screen}) => screen.x >= 24 && screen.x <= window.innerWidth - 360 && screen.y >= 24 && screen.y <= window.innerHeight - 24)
      return {
        editorId: feature?.editorId,
        point: point?.candidate,
        screen: point?.screen,
      }
    })
    assert.ok(linkedFeaturePick.editorId)
    assert.ok(linkedFeaturePick.screen)
    await page.mouse.click(linkedFeaturePick.screen.x, linkedFeaturePick.screen.y)
    assert.equal(await page.locator("#editor-selection").inputValue(), `feature:${linkedFeaturePick.editorId}`)

    await page.locator("#spawn-item").click()
    assert.equal(await page.evaluate(() => window.qa.map.walls.length), initialWalls + 1)
    assert.equal(await page.locator("#editor-popover").isVisible(), true)
    await page.waitForTimeout(100)
    const popoverPlacement = await page.evaluate(() => {
      const wall = window.qa.map.walls.at(-1)
      const center = {x: (wall.minX + wall.maxX) / 2, y: (wall.minY + wall.maxY) / 2}
      const anchor = window.qa.battleRenderer.worldToScreen(center.x, center.y)
      const rect = document.querySelector("#editor-popover").getBoundingClientRect()
      return {popoverBottom: rect.bottom, anchorY: anchor.y}
    })
    if (popoverPlacement.anchorY >= 0 && popoverPlacement.anchorY <= 960) {
      assert.ok(popoverPlacement.popoverBottom <= popoverPlacement.anchorY + 4)
    }
    await page.locator("#popover-rotation").fill("37.5")
    await page.locator("#popover-rotation").dispatchEvent("change")
    assert.ok(Math.abs(await page.evaluate(() => window.qa.map.walls.at(-1).rotation) - 37.5 * Math.PI / 180) < 1e-8)
    await page.keyboard.press("Control+z")
    assert.equal(await page.evaluate(() => window.qa.map.walls.at(-1).rotation), 0)
    await page.keyboard.press("Control+y")
    assert.ok(Math.abs(await page.evaluate(() => window.qa.map.walls.at(-1).rotation) - 37.5 * Math.PI / 180) < 1e-8)

    await page.locator("#editor-kind").selectOption("feature")
    await page.locator("#spawn-item").click()
    assert.equal(await page.evaluate(() => window.qa.map.features.length), initialFeatures + 1)
    await page.locator("#delete-item").click()
    assert.equal(await page.evaluate(() => window.qa.map.features.length), initialFeatures)

    const linkedFeature = await page.evaluate(() => {
      const feature = window.qa.map.features.find(candidate => window.qa.map.walls.some(wall => wall.linkedFeatureId === candidate.id))
      const wall = feature && window.qa.map.walls.find(candidate => candidate.linkedFeatureId === feature.id)
      return feature && wall ? {
        editorId: feature.editorId,
        featureX: feature.x,
        featureY: feature.y,
        wallCenterX: (wall.minX + wall.maxX) / 2,
        wallCenterY: (wall.minY + wall.maxY) / 2,
      } : null
    })
    assert.ok(linkedFeature, "canonical map exposes a feature-owned collision")
    await page.locator("#editor-selection").selectOption(`feature:${linkedFeature.editorId}`)
    await page.locator("#popover-x").fill(String(linkedFeature.featureX + 80))
    await page.locator("#popover-x").dispatchEvent("change")
    const movedLinkedWall = await page.evaluate(() => {
      const feature = window.qa.map.features.find(candidate => candidate.editorId === document.querySelector("#editor-selection").value.split(":")[1])
      const wall = window.qa.map.walls.find(candidate => candidate.linkedFeatureId === feature.id)
      return {featureX: feature.x, wallCenterX: (wall.minX + wall.maxX) / 2, wallCenterY: (wall.minY + wall.maxY) / 2}
    })
    assert.equal(movedLinkedWall.featureX, linkedFeature.featureX + 80)
    assert.equal(movedLinkedWall.wallCenterX, linkedFeature.wallCenterX + 80)
    assert.equal(movedLinkedWall.wallCenterY, linkedFeature.wallCenterY)
    await page.keyboard.press("Control+z")
    assert.equal(await page.evaluate(({editorId, x}) => window.qa.map.features.find(feature => feature.editorId === editorId).x, {editorId: linkedFeature.editorId, x: linkedFeature.featureX}), linkedFeature.featureX)

    await page.locator("#save-code").click()
    await page.waitForFunction(() => document.querySelector("#status")?.textContent.includes("Код карты обновлён"))
    const firstWallValue = await page.locator("#editor-selection option").nth(1).getAttribute("value")
    await page.locator("#editor-selection").selectOption(firstWallValue)
    assert.equal(await page.locator("#editor-popover").isVisible(), true)

    await page.screenshot({path: output, fullPage: true})
    await page.setViewportSize({width: 390, height: 844})
    assert.equal(await page.locator("#editor-tools").isVisible(), true)
    assert.ok(await page.locator("#inspector").boundingBox())
    assert.deepEqual(consoleErrors, [])
    assert.deepEqual(pageErrors, [])
  },
)
