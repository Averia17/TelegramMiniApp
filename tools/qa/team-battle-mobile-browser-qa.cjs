const fs = require("node:fs")
const path = require("node:path")
const assert = require("node:assert/strict")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.TEAM_BATTLE_MOBILE_QA_URL || "http://localhost"
const outputDir = path.resolve(__dirname, "../../output/playwright/team-battle-mobile")
const viewports = [
  {name: "iphone-se", width: 375, height: 667},
  {name: "iphone-14", width: 390, height: 844},
  {name: "pixel-7", width: 412, height: 915},
  {name: "galaxy-s20", width: 360, height: 800},
  {name: "android-wide", width: 430, height: 932},
]

const inspectBattle = () => {
  const rect = element => {
    if (!element) return null
    const value = element.getBoundingClientRect()
    return {left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height}
  }
  const visible = element => element && getComputedStyle(element).display !== "none" && rect(element)?.width > 0
  const nodes = [
    ["topbar", ".battle-topbar"],
    ["brand", ".battle-mode-pill"],
    ["timer", ".battle-match-timer"],
    ["score", ".team-battle-hud"],
    ["objectives", ".team-objective-hud"],
    ["player", ".battle-player-card"],
    ["minimap", ".battle-minimap"],
    ["abilities", ".battle-abilities"],
    ["messages", ".battle-messages"],
    ["network", ".network-status-notice"],
    ["threat", ".tower-threat-notice"],
  ]
  const elements = Object.fromEntries(nodes.map(([name, selector]) => [name, rect(document.querySelector(selector))]))
  const overlap = (first, second) => {
    const a = elements[first]
    const b = elements[second]
    if (!a || !b) return false
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  }
  const pairs = [
    ["timer", "score"],
    ["score", "objectives"],
    ["objectives", "player"],
    ["objectives", "minimap"],
    ["player", "minimap"],
    ["player", "abilities"],
    ["minimap", "abilities"],
  ]
  return {
    viewport: {width: innerWidth, height: innerHeight},
    documentWidth: document.documentElement.scrollWidth,
    elements,
    gaps: {
      timerToScore: elements.timer && elements.score ? elements.score.top - elements.timer.bottom : null,
      scoreToObjectives: elements.score && elements.objectives ? elements.objectives.top - elements.score.bottom : null,
    },
    overlaps: pairs.filter(([first, second]) => overlap(first, second)).map(([first, second]) => `${first}:${second}`),
  }
}

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    fs.mkdirSync(outputDir, {recursive: true})
    const reports = []
    const viewport = viewports[0]
    const devUser = String(970000000 + viewport.width * 1000 + viewport.height + (Date.now() % 1000))
    const context = await browser.newContext({viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true})
    const page = await context.newPage()
    const consoleErrors = []
    const pageErrors = []
    page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()) })
    page.on("pageerror", error => pageErrors.push(error.stack || String(error)))
    await page.addInitScript(userId => {
      localStorage.setItem(`battle_mode:${userId}`, "team")
      localStorage.setItem(`battle_hero:${userId}`, "Needle")
    }, devUser)
    await page.route("**/api/party/**", route => route.fulfill({status: 200, contentType: "application/json", body: "{}"}))
    await page.goto(`${baseUrl}/?devUser=${devUser}`, {waitUntil: "domcontentloaded", timeout: 30000})
    await page.locator(".lp-play-btn:not([disabled])").waitFor({timeout: 30000})
    await page.locator(".lp-play-btn:not([disabled])").click()
    await page.waitForFunction(() => {
      const state = window.__battleRenderer?.impl?.state || window.__battleClient?.lastState
      return state?.game?.mode === "team deathmatch" && Object.keys(state?.players || {}).length === 6
    }, {timeout: 45000})
    for (const viewport of viewports) {
      await page.setViewportSize({width: viewport.width, height: viewport.height})
      await page.waitForTimeout(500)
      const report = await page.evaluate(inspectBattle)
      assert.ok(report.documentWidth <= viewport.width + 1, `${viewport.name}: battle overflows horizontally`)
      assert.ok(report.gaps.timerToScore >= 8, `${viewport.name}: timer and team score are too close (${report.gaps.timerToScore}px)`)
      assert.ok(report.gaps.scoreToObjectives >= 8, `${viewport.name}: team score and objectives are too close (${report.gaps.scoreToObjectives}px)`)
      assert.deepEqual(report.overlaps, [], `${viewport.name}: overlapping HUD blocks: ${report.overlaps.join(", ")}`)
      assert.deepEqual(consoleErrors, [], `${viewport.name}: browser console errors: ${consoleErrors.join("\n")}`)
      assert.deepEqual(pageErrors, [], `${viewport.name}: page errors: ${pageErrors.join("\n")}`)
      await page.screenshot({path: path.join(outputDir, `${viewport.name}.png`), fullPage: true})
      reports.push({viewport, report, consoleErrors, pageErrors})
    }
    await context.close()
    const reportPath = path.join(outputDir, "report.json")
    fs.writeFileSync(reportPath, JSON.stringify(reports, null, 2))
    console.log(JSON.stringify({reportPath, reports}, null, 2))
    return reports
  },
  {maxRuntimeMs: 150000},
)
