const fs = require("node:fs")
const path = require("node:path")
const assert = require("node:assert/strict")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const ROOT = path.resolve(__dirname, "../..")
const BASE_URL = process.env.MOBILE_QA_URL || "http://localhost"
const OUTPUT = path.join(ROOT, "output", "playwright", "mobile-responsive")
const VIEWPORTS = [
  {name: "phone-320", width: 320, height: 568},
  {name: "phone-375", width: 375, height: 667},
  {name: "phone-430", width: 430, height: 932},
]

const inspectPage = page => page.evaluate(() => {
  const rect = element => {
    if (!element) return null
    const value = element.getBoundingClientRect()
    return {left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height}
  }
  const visible = element => element && getComputedStyle(element).display !== "none" && rect(element).width > 0
  const interactive = [...document.querySelectorAll("button, [role=button]")]
    .filter(visible)
    .map(element => ({label: element.getAttribute("aria-label") || element.textContent.trim().slice(0, 32), ...rect(element)}))
  return {
    viewport: {width: innerWidth, height: innerHeight},
    documentWidth: document.documentElement.scrollWidth,
    rootWidth: document.getElementById("root")?.scrollWidth,
    interactive,
    topbar: rect(document.querySelector(".lp-topbar, .battle-topbar")),
    dock: rect(document.querySelector(".lp-battle-dock")),
    phase: rect(document.querySelector(".island-phase-hud")),
    player: rect(document.querySelector(".battle-player-card")),
    minimap: rect(document.querySelector(".battle-minimap")),
    abilities: rect(document.querySelector(".battle-abilities")),
    tauntPack: (() => {
      const pack = document.querySelector(".taunt-pack-card")
      if (!pack) return null
      const style = getComputedStyle(pack)
      return {rect: rect(pack), display: style.display, columns: style.gridTemplateColumns, children: [...pack.children].map(child => ({className: child.className, rect: rect(child), minWidth: getComputedStyle(child).minWidth}))}
    })(),
  }
})

const assertInsideViewport = (report, label) => {
  assert.ok(report.documentWidth <= report.viewport.width + 1, `${label}: document overflows horizontally`)
  assert.ok(report.rootWidth <= report.viewport.width + 1, `${label}: root overflows horizontally`)
  for (const item of report.interactive) {
    assert.ok(item.left >= -1 && item.right <= report.viewport.width + 1, `${label}: control "${item.label}" is outside viewport`)
  }
}

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    fs.mkdirSync(OUTPUT, {recursive: true})
    const results = []
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true})
      const page = await context.newPage()
      const consoleErrors = []
      const pageErrors = []
      page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()) })
      page.on("pageerror", error => pageErrors.push(error.stack || String(error)))
      const devUser = String(950000000 + viewport.width * 1000 + viewport.height)

      await page.goto(`${BASE_URL}/?devUser=${devUser}`, {waitUntil: "domcontentloaded", timeout: 30000})
      await page.locator(".lp").waitFor({timeout: 30000})
      await page.locator(".hero-roster-button").waitFor({timeout: 30000})
      const lobby = await inspectPage(page)
      assertInsideViewport(lobby, `${viewport.name} lobby`)
      await page.screenshot({path: path.join(OUTPUT, `${viewport.name}-lobby.png`)})

      await page.locator(".hero-roster-button").click()
      const roster = await inspectPage(page)
      assertInsideViewport(roster, `${viewport.name} roster`)
      await page.screenshot({path: path.join(OUTPUT, `${viewport.name}-roster.png`)})
      await page.locator(".hero-roster-header button").click()

      const tabs = {}
      for (const tab of ["store", "profile", "rating"]) {
        await page.goto(`${BASE_URL}/?devUser=${devUser}&tab=${tab}`, {waitUntil: "domcontentloaded", timeout: 30000})
        await page.locator(`.lp--${tab}`).waitFor({timeout: 30000})
        const report = await inspectPage(page)
        assertInsideViewport(report, `${viewport.name} ${tab}`)
        if (tab === "store" && viewport.width === 320) {
          const copy = report.tauntPack?.children.find(child => child.className === "taunt-pack-card__copy")
          assert.ok(copy?.rect.width >= 140, "phone-320 store: taunt copy is squeezed")
        }
        tabs[tab] = report
        await page.screenshot({path: path.join(OUTPUT, `${viewport.name}-${tab}.png`)})
      }

      await page.goto(`${BASE_URL}/katty-lab`, {waitUntil: "domcontentloaded", timeout: 30000})
      await page.locator(".katty-lab").waitFor({timeout: 30000})
      const katty = await inspectPage(page)
      assertInsideViewport(katty, `${viewport.name} katty-lab`)
      await page.screenshot({path: path.join(OUTPUT, `${viewport.name}-katty-lab.png`)})

      results.push({viewport, lobby, roster, tabs, katty, consoleErrors, pageErrors})
      await context.close()
    }

    const viewport = {name: "battle-375", width: 375, height: 667}
    const context = await browser.newContext({viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true})
    const page = await context.newPage()
    const consoleErrors = []
    const pageErrors = []
    page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()) })
    page.on("pageerror", error => pageErrors.push(error.stack || String(error)))
    await page.goto(`${BASE_URL}/?devUser=959375667`, {waitUntil: "domcontentloaded", timeout: 30000})
    await page.locator(".lp-play-btn").waitFor({timeout: 30000})
    await page.locator(".lp-play-btn").click()
    await page.locator(".battle-game").waitFor({timeout: 30000})
    await page.locator(".battle-topbar").waitFor({timeout: 45000})
    const battle = await inspectPage(page)
    assertInsideViewport(battle, "battle-375")
    for (const item of [battle.topbar, battle.phase, battle.player, battle.minimap, battle.abilities].filter(Boolean)) {
      assert.ok(item.left >= -1 && item.right <= viewport.width + 1, "battle HUD element is outside viewport")
      assert.ok(item.top >= -1 && item.bottom <= viewport.height + 1, "battle HUD element is outside viewport height")
    }
    await page.screenshot({path: path.join(OUTPUT, "battle-375-game.png")})
    results.push({viewport, battle, consoleErrors, pageErrors})
    await context.close()

    const unexpectedErrors = results.flatMap(result => [...result.consoleErrors, ...result.pageErrors])
    assert.deepEqual(unexpectedErrors, [], `browser errors: ${unexpectedErrors.join("\n")}`)
    const reportPath = path.join(OUTPUT, "report.json")
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2))
    console.log(JSON.stringify({reportPath, screenshots: fs.readdirSync(OUTPUT).filter(file => file.endsWith(".png")), results}, null, 2))
    return results
  },
)
