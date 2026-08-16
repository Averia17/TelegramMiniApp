const assert = require("node:assert/strict")
const path = require("node:path")
const {chromium} = require("playwright")
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.TEAM_BATTLE_QA_URL || "http://localhost"
const output = path.resolve(__dirname, "../../output/playwright/team-battle-live.png")

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    const page = await browser.newPage({viewport: {width: 1440, height: 900}})
    const consoleErrors = []
    const pageErrors = []
    page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()) })
    page.on("pageerror", error => pageErrors.push(error.stack || String(error)))

    await page.goto(`${baseUrl}/battle?mode=team&devUser=920000001`, {waitUntil: "domcontentloaded", timeout: 30000})
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
    assert.deepEqual(consoleErrors, [])
    assert.deepEqual(pageErrors, [])
  },
  {maxRuntimeMs: 45000},
)
