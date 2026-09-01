const assert = require("node:assert/strict")
const path = require("node:path")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.TEAM_BATTLE_QA_URL || "http://localhost"
const devUser = process.env.TEAM_BATTLE_QA_USER || "920000001"
const selectedMap = process.env.TEAM_BATTLE_QA_MAP === "team-battle" ? "team-battle" : "team-battle-northern"
const expectedMapId = selectedMap === "team-battle" ? "team-battle@20260816" : "team-battle-northern@20260827"
const output = path.resolve(__dirname, `../../output/playwright/team-battle-live-${selectedMap}.png`)

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    const page = await browser.newPage({viewport: {width: 1440, height: 900}})
    const consoleErrors = []
    const pageErrors = []
    page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()) })
    page.on("pageerror", error => pageErrors.push(error.stack || String(error)))

    // Enter through the lobby so the route carries startNewBattle state. A
    // direct /battle URL is intentionally treated as recovery and can return
    // to the lobby when there is no authoritative room to resume.
    await page.addInitScript(({userId, mapName}) => {
      localStorage.setItem(`battle_mode:${userId}`, "team")
      localStorage.setItem(`battle_map:${userId}`, mapName)
      localStorage.setItem(`battle_hero:${userId}`, "Needle")
    }, {userId: devUser, mapName: selectedMap})
    // Party notifications are optional for this battle QA and may be absent
    // in a minimal local compose profile; keep that optional dependency from
    // turning a map regression into a proxy error.
    await page.route("**/api/party/**", route => route.fulfill({status: 200, contentType: "application/json", body: "{}"}))
    await page.goto(`${baseUrl}/?devUser=${devUser}`, {waitUntil: "domcontentloaded", timeout: 30000})
    await page.locator(".lp-play-btn:not([disabled])").waitFor({timeout: 30000})
    await page.locator(".lp-play-btn:not([disabled])").click()
    await page.waitForFunction(() => {
      const state = window.__battleRenderer?.impl?.state || window.__battleClient?.lastState
      return state?.game?.mode === "team deathmatch" && Object.keys(state?.players || {}).length === 6
    }, {timeout: 30000})
    await page.waitForTimeout(6000)
    const report = await page.evaluate(() => {
      const client = window.__battleClient
      const renderer = window.__battleRenderer?.impl
      const state = renderer?.state || client?.lastState || null
      const players = Object.values(state?.players || {})
      const clientPlayers = Object.values(client?.lastState?.players || {})
      const playerById = Object.fromEntries(players.map(player => [String(player.playerId), player]))
      const friendlyFireEvents = (state?.combatEvents || []).filter(event => {
        const source = playerById[String(event.sourceId)]
        const target = playerById[String(event.targetId)]
        return source?.team && target?.team && source.team === target.team
      })
      const local = players.find(player => String(player.playerId) === String(client?.playerId))
      const walls = Array.isArray(state?.map?.walls) ? state.map.walls : []
      const riverWalls = walls.filter(wall => wall.type === "river" || wall.type === "river_bridge")
      const bridgeWalls = riverWalls.filter(wall => wall.type === "river_bridge")
      const riverAlong = wall => (Number(wall.minX) / 40 + .5 + Number(wall.minY) / 40 + .5) * .5
      const riverFeature = renderer?.mapRenderer?.featureObjects?.get?.("team-river")
      const riverWater = riverFeature?.getObjectByName?.("team-river-water")
      let renderedRiverBounds = null
      let renderedRiverCenter = null
      if (riverWater) {
        riverWater.geometry.computeBoundingBox()
        renderedRiverBounds = {
          minX: riverWater.geometry.boundingBox.min.x,
          maxX: riverWater.geometry.boundingBox.max.x,
        }
        renderedRiverCenter = {
          x: riverFeature.position.x,
          z: riverFeature.position.z,
        }
      }
      const views = [...(renderer?.players?.values?.() || [])].map(view => ({
        id: view.id,
        role: view.label?.userData?.role,
        markerVisible: Boolean(view.teamMarker?.visible),
        markerColor: view.teamMarker?.material?.color?.getHexString?.() || null,
        teamBattle: view.teamBattle,
      }))
      return {
        url: location.href,
        clientPlayerId: client?.playerId || null,
        mode: state?.game?.mode || null,
        maxPlayers: state?.game?.maxPlayers || null,
        playerCount: players.length,
        clientSnapshotPlayerCount: clientPlayers.length,
        botCount: players.filter(player => String(player.name || "").startsWith("BOT")).length,
        teams: players.reduce((result, player) => {
          const team = player.team || "unknown"
          result[team] = (result[team] || 0) + 1
          return result
        }, {}),
        localTeam: local?.team || null,
        views,
        hasEnemyRedView: views.some(view => view.markerVisible && view.markerColor === "ff334d"),
        combatEvents: (state?.combatEvents || []).length,
        friendlyFireEvents,
        mapId: state?.map?.id || null,
        riverCellCount: riverWalls.length,
        bridgeCellCount: bridgeWalls.length,
        riverMinAlong: riverWalls.length ? Math.min(...riverWalls.map(riverAlong)) : null,
        riverMaxAlong: riverWalls.length ? Math.max(...riverWalls.map(riverAlong)) : null,
        renderedRiverBounds,
        renderedRiverCenter,
        screenshot: true,
      }
    })
    await page.screenshot({path: output, fullPage: true})
    console.log(JSON.stringify({report, consoleErrors, pageErrors, screenshot: output}, null, 2))
    assert.equal(report.mode, "team deathmatch", "team battle did not start")
    assert.equal(report.playerCount, 6, "team battle must have six players")
    assert.equal(report.botCount, 5, "one real player must produce five bots")
    assert.equal(report.hasEnemyRedView, true, "enemy red marker was not rendered")
    assert.deepEqual(report.friendlyFireEvents, [], "friendly-fire combat event detected")
    assert.equal(report.mapId, expectedMapId, "unexpected team map")
    assert.ok(report.riverCellCount >= 300, "river collision layer is incomplete")
    assert.ok(report.bridgeCellCount >= 60, "bridge collision layer is incomplete")
    assert.equal(report.riverMinAlong, 10, "river does not reach the first island shoreline")
    assert.equal(report.riverMaxAlong, 60, "river does not reach the second island shoreline")
    assert.ok(report.renderedRiverBounds?.minX <= -91.9, "river does not reach the western shoreline")
    assert.ok(report.renderedRiverBounds?.maxX >= 93.9, "river does not reach the eastern shoreline")
    assert.ok(report.renderedRiverBounds?.minX > -93, "river mouth overshoots into the western ocean")
    assert.ok(report.renderedRiverBounds?.maxX < 95, "river mouth overshoots into the eastern ocean")
    assert.ok(Math.abs((report.renderedRiverCenter?.x || 0) - 89.7) < .01, "river feature is not aligned with the cropped map")
    assert.ok(Math.abs((report.renderedRiverCenter?.z || 0) - 89.7) < .01, "river feature is not aligned with the cropped map")
    assert.deepEqual(consoleErrors, [])
    assert.deepEqual(pageErrors, [])
  },
  {maxRuntimeMs: 45000},
)
