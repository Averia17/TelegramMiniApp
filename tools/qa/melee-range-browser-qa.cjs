const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.MELEE_RANGE_QA_URL || "http://127.0.0.1:5173"
const output = path.resolve(__dirname, "../../output/playwright/melee-range")

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    const page = await browser.newPage({viewport: {width: 1100, height: 900}, deviceScaleFactor: 1})
    const consoleErrors = []
    const pageErrors = []
    page.on("console", message => {
      if (message.type() === "error") consoleErrors.push(message.text())
    })
    page.on("pageerror", error => pageErrors.push(error.stack || String(error)))
    await page.route("**/api/battle/heroes", route => route.fulfill({json: [{name: "Mandy"}]}))
    await page.route("**/api/battle/map-preview", route => route.fulfill({json: {
      map: {width: 1024, height: 768, tileSize: 40, walls: []},
    }}))
    await page.goto(`${baseUrl}/test/glb-hero-harness?hero=Mandy`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    })
    await page.waitForFunction(() => document.querySelector("#status")?.classList.contains("ready"), {
      timeout: 30_000,
    })
    const indicator = await page.evaluate(() => {
      Object.assign(window.qa.player, {
        aiming: true,
        attackArchetype: "melee_cone",
        attackRange: 70,
        attackHalfArcDegrees: 60,
        color: "#F4C542",
      })
      window.qa.battleRenderer.setState(window.qa.battleState)
      window.qa.battleRenderer.render()
      const aim = window.qa.battleRenderer.aim
      return {
        areaVisible: aim.meleeArea.visible,
        edgeVisible: aim.meleeRangeEdge.visible,
        areaScale: aim.meleeArea.scale.x,
        edgeScale: aim.meleeRangeEdge.scale.x,
        areaOpacity: aim.meleeArea.material.opacity,
        edgeOpacity: aim.meleeRangeEdge.material.opacity,
      }
    })
    const autoTurn = await page.evaluate(async () => {
      const {NetworkSimulation} = await import("/src/components/BattleGame/NetworkSimulation.js")
      const simulation = new NetworkSimulation({interpolationDelay: 0})
      simulation.ingest({
        type: "state",
        ts: 1000,
        game: {state: "game"},
        map: {width: 500, height: 500, walls: []},
        players: {
          local: {playerId: "local", hero: "Mandy", x: 200, y: 200, radius: 14, lives: 720, ammo: 3, rotation: 0, attackPulse: 4, attackArchetype: "melee_cone", attackRange: 70},
          enemy: {playerId: "enemy", hero: "Needle", x: 140, y: 200, radius: 14, lives: 620, team: "enemy"},
        },
        monsters: {},
        bullets: [],
      }, 0, 1000)
      simulation.setLocalPlayerId("local")
      simulation.predictLocalShoot({angle: 0, autoAim: true, commandId: "browser-tap-behind", now: 1001})
      const local = simulation.getDisplayState(1001).players.local
      return {rotation: local.rotation, attackPulse: local.attackPulse}
    })
    fs.mkdirSync(output, {recursive: true})
    const screenshot = path.join(output, "mandy-melee-range.png")
    await page.screenshot({path: screenshot, fullPage: true})

    assert.equal(indicator.areaVisible, true)
    assert.equal(indicator.edgeVisible, true)
    assert.equal(indicator.areaScale, indicator.edgeScale)
    assert.ok(indicator.edgeOpacity > indicator.areaOpacity)
    assert.ok(Math.cos(autoTurn.rotation) < -.99)
    assert.equal(autoTurn.attackPulse, 5)
    assert.deepEqual(pageErrors, [])
    assert.deepEqual(consoleErrors, [])
    process.stdout.write(JSON.stringify({indicator, autoTurn, consoleErrors, pageErrors, screenshot}, null, 2))
  },
).catch(error => {
  console.error(error)
  process.exitCode = 1
})
