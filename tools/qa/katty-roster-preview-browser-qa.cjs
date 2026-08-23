const fs = require("node:fs")
const path = require("node:path")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.KATTY_ROSTER_QA_URL || "http://127.0.0.1:5173"
const output = path.resolve(__dirname, "../../output/playwright/katty-roster-preview.png")

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    const page = await browser.newPage({viewport: {width: 1400, height: 900}, deviceScaleFactor: 1})
    const consoleErrors = []
    const pageErrors = []
    page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()) })
    page.on("pageerror", error => pageErrors.push(error.stack || String(error)))
    await page.route("**/api/**", async route => {
      const pathname = new URL(route.request().url()).pathname
      if (pathname.endsWith("/auth/telegram")) return route.fulfill({json: {access_token: "qa", user_id: 920000001}})
      if (pathname.endsWith("/economy/me")) return route.fulfill({json: {energy: 100, max_energy: 100, gold: 0, crystals: 0, taunt_charges: 0, next_energy_in: 0}})
      if (pathname.endsWith("/heroes")) return route.fulfill({json: [{name: "Katty", displayName: "Katty", rarity: "LEGENDARY", color: "#d449b5", role: "Controller", maxLives: 640, speed: 14, attackDamage: 52, title: "STREET PAINT ARTIST", attackDescription: "Проверка", superDescription: "Проверка", passiveDescription: "Проверка", attack: {archetype: "projectile"}}]})
      return route.fulfill({json: {}})
    })
    await page.goto(`${baseUrl}/?devUser=920000001`, {waitUntil: "domcontentloaded", timeout: 30000})
    await page.locator(".hero-model-canvas").waitFor({timeout: 30000})
    await page.waitForTimeout(1800)
    fs.mkdirSync(path.dirname(output), {recursive: true})
    await page.screenshot({path: output, fullPage: true})
    console.log(JSON.stringify({output, consoleErrors, pageErrors}, null, 2))
    if (consoleErrors.length || pageErrors.length) process.exitCode = 1
  },
).catch(error => {
  console.error(error)
  process.exitCode = 1
})
