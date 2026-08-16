const fs = require("node:fs")
const path = require("node:path")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const ROOT = path.resolve(__dirname, "../..")
const BASE_URL = process.env.ATTACK_RELOAD_QA_URL || "http://localhost"
const DEV_USER = process.env.ATTACK_RELOAD_QA_USER || String(930000000 + Math.floor(Math.random() * 9999999))
const OUTPUT = path.join(ROOT, "output", "playwright", "attack-reload-indicator")

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    const page = await browser.newPage({viewport: {width: 430, height: 932}, deviceScaleFactor: 1})
    const consoleErrors = []
    const pageErrors = []
    page.on("console", message => {
      if (message.type() === "error") consoleErrors.push(message.text())
    })
    page.on("pageerror", error => pageErrors.push(error.stack || String(error)))

    await page.goto(`${BASE_URL}/?devUser=${encodeURIComponent(DEV_USER)}`, {waitUntil: "commit", timeout: 30000})
    await page.locator(".hero-roster-button").waitFor({state: "visible", timeout: 30000})
    await page.locator(".hero-roster-button").click()
    await page.locator(".hero-roster .hero-card").first().click()
    await page.locator(".lp-play-btn").click()
    await page.waitForFunction(() => {
      const value = window.render_game_to_text?.()
      return value && JSON.parse(value).mode === "game"
    }, {timeout: 30000})
    await page.waitForTimeout(900)

    const visual = await page.evaluate(() => {
      const renderer = window.__battleRenderer?.impl
      const client = window.__battleClient
      const localId = String(client?.playerId || "")
      const localView = renderer?.players?.get(localId)
      if (!renderer || !localView?.attackReloadIndicator) return null
      localView.attackReloadIndicator.update({...localView.state, ammo: 1, maxAmmo: 3, reloadProgress: .45, lives: 100})
      renderer.render()
      const indicators = [...renderer.players.values()].filter(view => view.attackReloadIndicator?.group.visible)
      const litPerSlot = localView.attackReloadIndicator.dashes
        .map(dash => dash.material.color.b > .35)
      return {
        localId,
        visibleIndicators: indicators.length,
        localIndicatorVisible: localView.attackReloadIndicator.group.visible,
        dashCount: localView.attackReloadIndicator.dashes.length,
        litPerSlot,
      }
    })

    fs.mkdirSync(OUTPUT, {recursive: true})
    const screenshot = path.join(OUTPUT, `attack-reload-${DEV_USER}.png`)
    await page.screenshot({path: screenshot, fullPage: true})
    const report = {devUser: DEV_USER, visual, consoleErrors, pageErrors, screenshot}
    console.log(JSON.stringify(report, null, 2))
    if (!visual?.localIndicatorVisible || visual.visibleIndicators !== 1 || visual.dashCount !== 3) {
      throw new Error(`Attack reload indicator QA failed: ${JSON.stringify(visual)}`)
    }
    if (consoleErrors.length || pageErrors.length) {
      throw new Error(`Browser errors: ${JSON.stringify({consoleErrors, pageErrors})}`)
    }
  },
)
