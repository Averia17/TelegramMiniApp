const fs = require("node:fs")
const path = require("node:path")
const assert = require("node:assert/strict")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.MOBILE_BATTLE_SHELL_QA_URL || "http://127.0.0.1"
const outputDir = path.resolve(__dirname, "../../output/playwright/mobile-battle-shell")
const viewports = [
  {name: "android-compact", width: 320, height: 568},
  {name: "iphone-se", width: 375, height: 667},
  {name: "iphone-14", width: 390, height: 844},
  {name: "pixel-7", width: 412, height: 915},
  {name: "galaxy-s20", width: 360, height: 800},
  {name: "android-wide", width: 430, height: 932},
  {name: "android-compact-landscape", width: 568, height: 320},
  {name: "iphone-se-landscape", width: 667, height: 375},
  {name: "android-landscape", width: 932, height: 430},
]

const inspectBattle = () => {
  const rect = element => {
    if (!element) return null
    const value = element.getBoundingClientRect()
    return {left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height}
  }
  const elements = Object.fromEntries([
    ["topbar", ".battle-topbar"],
    ["score", ".team-battle-hud"],
    ["objectives", ".team-objective-hud"],
    ["player", ".battle-player-card"],
    ["minimap", ".battle-minimap"],
    ["abilities", ".battle-abilities"],
    ["taunt", ".battle-taunt-slot"],
    ["messages", ".battle-messages"],
    ["network", ".network-status-notice"],
    ["threat", ".tower-threat-notice"],
    ["moveStick", ".mobile-stick-move"],
    ["fireStick", ".mobile-stick-fire"],
  ].map(([name, selector]) => [name, rect(document.querySelector(selector))]))
  const overlap = (first, second) => {
    const a = elements[first]
    const b = elements[second]
    if (!a || !b) return false
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  }
  const pairs = [
    ["score", "objectives"],
    ["objectives", "player"],
    ["objectives", "minimap"],
    ["player", "minimap"],
    ["messages", "player"],
    ["messages", "minimap"],
    ["messages", "abilities"],
    ["network", "score"],
    ["network", "threat"],
    ["network", "objectives"],
    ["network", "player"],
    ["network", "minimap"],
    ["network", "messages"],
    ["network", "abilities"],
    ["network", "moveStick"],
    ["network", "fireStick"],
    ["threat", "score"],
    ["threat", "objectives"],
    ["threat", "player"],
    ["threat", "minimap"],
    ["threat", "messages"],
    ["threat", "abilities"],
    ["threat", "moveStick"],
    ["threat", "fireStick"],
    ["moveStick", "messages"],
    ["fireStick", "abilities"],
    ["fireStick", "taunt"],
  ]
  return {
    viewport: {width: innerWidth, height: innerHeight},
    documentWidth: document.documentElement.scrollWidth,
    battleRoot: rect(document.querySelector(".battle-game")),
    elements,
    overlaps: pairs.filter(([first, second]) => overlap(first, second)).map(([first, second]) => `${first}:${second}`),
    gaps: {
      scoreToObjectives: elements.score && elements.objectives ? elements.objectives.top - elements.score.bottom : null,
      moveToMessages: elements.moveStick && elements.messages ? elements.moveStick.top - elements.messages.bottom : null,
    },
    controls: [...document.querySelectorAll(".mobile-stick, .battle-abilities button, .battle-taunt-slot button")].map(element => ({
      className: element.className,
      ...rect(element),
    })),
  }
}

const assertInside = (report, viewport) => {
  assert.ok(report.documentWidth <= viewport.width + 1, `${viewport.name}: battle overflows horizontally`)
  assert.ok(Math.abs(report.battleRoot.width - viewport.width) <= 1, `${viewport.name}: battle root width is stale`)
  assert.ok(Math.abs(report.battleRoot.height - viewport.height) <= 1, `${viewport.name}: battle root height is stale`)
  for (const [name, item] of Object.entries(report.elements)) {
    if (!item) continue
    assert.ok(item.left >= -1 && item.right <= viewport.width + 1, `${viewport.name}: ${name} is outside horizontal viewport`)
    assert.ok(item.top >= -1 && item.bottom <= viewport.height + 1, `${viewport.name}: ${name} is outside vertical viewport`)
  }
  for (const item of report.controls) {
    assert.ok(item.left >= -1 && item.right <= viewport.width + 1, `${viewport.name}: control ${item.className} is outside viewport`)
    assert.ok(item.top >= -1 && item.bottom <= viewport.height + 1, `${viewport.name}: control ${item.className} is outside viewport height`)
  }
}

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    fs.mkdirSync(outputDir, {recursive: true})
    const devUser = process.env.MOBILE_BATTLE_SHELL_QA_USER || String(980000000 + (Date.now() % 100000))
    const context = await browser.newContext({viewport: viewports[0], deviceScaleFactor: 1, isMobile: true, hasTouch: true})
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
    // Ignore long-lived third-party resources; the battle shell has its own
    // readiness signal and can be tested as soon as the document commits.
    await page.goto(`${baseUrl}/?devUser=${devUser}`, {waitUntil: "commit", timeout: 30000})
    await page.locator(".lp-play-btn:not([disabled])").waitFor({timeout: 30000})
    await page.locator(".lp-play-btn:not([disabled])").click()
    await page.waitForFunction(() => {
      const state = window.__battleRenderer?.impl?.state || window.__battleClient?.lastState
      return state?.game?.mode === "team deathmatch" && Object.keys(state?.players || {}).length === 6
    }, {timeout: 45000})
    const reports = []
    for (const viewport of viewports) {
      await page.setViewportSize({width: viewport.width, height: viewport.height})
      await page.waitForTimeout(350)
      await page.evaluate(() => {
        if (!document.querySelector(".network-status-notice")) {
          document.querySelector(".battle-game")?.insertAdjacentHTML("beforeend", '<aside class="network-status-notice network-status-notice--poor"><span class="network-status-notice__signal"><i></i><i></i><i></i></span><span><b>СЛАБАЯ СВЯЗЬ</b><small>Проверь подключение</small></span></aside>')
        }
        if (!document.querySelector(".tower-threat-notice")) {
          document.querySelector(".battle-game")?.insertAdjacentHTML("beforeend", '<aside class="tower-threat-notice"><b>БАШНЯ ПОД УДАРОМ</b><span>Защити правый фланг</span></aside>')
        }
      })
      const report = await page.evaluate(inspectBattle)
      assertInside(report, viewport)
      assert.deepEqual(report.overlaps, [], `${viewport.name}: overlapping mobile shell blocks: ${report.overlaps.join(", ")}`)
      if (viewport.name === "iphone-se") {
        const touchControls = await page.evaluate(async () => {
          const canvas = document.querySelector(".battle-canvas")
          const createTouch = (identifier, x, y) => new Touch({identifier, target: canvas, clientX: x, clientY: y, pageX: x, pageY: y})
          const dispatch = (type, touch, touches) => canvas.dispatchEvent(new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            view: window,
            touches,
            targetTouches: touches,
            changedTouches: [touch],
          }))
          const moveStart = createTouch(41, 52, innerHeight - 80)
          dispatch("touchstart", moveStart, [moveStart])
          await new Promise(requestAnimationFrame)
          const moveActive = document.querySelector(".mobile-stick-move")?.classList.contains("mobile-stick--active")
          const moveEnd = createTouch(41, 92, innerHeight - 80)
          dispatch("touchmove", moveEnd, [moveEnd])
          dispatch("touchend", moveEnd, [])
          await new Promise(requestAnimationFrame)
          const moveReleased = !document.querySelector(".mobile-stick-move")?.classList.contains("mobile-stick--active")
          const aimStart = createTouch(42, innerWidth - 52, innerHeight - 80)
          dispatch("touchstart", aimStart, [aimStart])
          await new Promise(requestAnimationFrame)
          const aimActive = document.querySelector(".mobile-stick-fire")?.classList.contains("mobile-stick--active")
          dispatch("touchend", aimStart, [])
          return {moveActive, moveReleased, aimActive}
        })
        assert.deepEqual(touchControls, {moveActive: true, moveReleased: true, aimActive: true}, `${viewport.name}: touch controls did not track both sticks`)
      }
      await page.screenshot({path: path.join(outputDir, `${viewport.name}.png`), fullPage: true})
      reports.push({viewport, report})
    }
    assert.deepEqual(consoleErrors, [], `browser console errors: ${consoleErrors.join("\n")}`)
    assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join("\n")}`)
    await context.close()
    const reportPath = path.join(outputDir, "report.json")
    fs.writeFileSync(reportPath, JSON.stringify({reports, consoleErrors, pageErrors}, null, 2))
    console.log(JSON.stringify({reportPath, reports}, null, 2))
    return reports
  },
  {maxRuntimeMs: 150000},
)
