const assert = require("node:assert/strict")
const path = require("node:path")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.TEAM_MAP_SELECTION_QA_URL || "http://127.0.0.1:5173"
const output = path.resolve(__dirname, "../../output/playwright/team-map-selection.png")

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    const page = await browser.newPage({viewport: {width: 1280, height: 800}, deviceScaleFactor: 1})
    const consoleErrors = []
    const pageErrors = []
    page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()) })
    page.on("pageerror", error => pageErrors.push(error.stack || String(error)))
    await page.route("**/api/**", route => {
      const pathname = new URL(route.request().url()).pathname
      if (pathname.endsWith("/auth/telegram")) return route.fulfill({json: {access_token: "qa", user_id: 920000001}})
      if (pathname.endsWith("/users/me/profile")) return route.fulfill({json: {nickname: "Инспектор"}})
      if (pathname.endsWith("/economy/me")) return route.fulfill({json: {energy: 100, max_energy: 100, gold: 80, crystals: 20, taunt_charges: 0}})
      if (pathname.endsWith("/heroes")) return route.fulfill({json: [{name: "Kaze", displayName: "Kaze", color: "#7dd3fc", rarity: "ЭПИЧЕСКИЙ", role: "ШТУРМОВИК", maxLives: 720, speed: 100, attackDamage: 120, title: "Ветер клинка", attackDescription: "Быстрый удар", superDescription: "Рывок", passiveDescription: "След ветра", attack: {archetype: "melee"}}]})
      if (pathname.endsWith("/recent-teammates") || pathname.endsWith("/invites/inbox") || pathname.endsWith("/invites/outgoing")) return route.fulfill({json: []})
      if (pathname.endsWith("/party/mine")) return route.fulfill({json: {}})
      return route.fulfill({json: {}})
    })
    await page.goto(`${baseUrl}/?devUser=920000001`, {waitUntil: "domcontentloaded", timeout: 30_000})
    await page.locator(".lp-event-card").waitFor({timeout: 30_000})
    const picker = page.locator(".lp-map-picker button")
    assert.equal(await picker.count(), 0, "map picker should be hidden in solo mode")
    await page.locator(".hero-mode-button").click()
    await page.locator('[role="menuitem"]').filter({hasText: "КОМАНДА"}).click()
    await page.waitForTimeout(250)
    await page.locator(".lp-map-picker button").first().waitFor()
    assert.equal(await page.locator(".lp-map-picker button").count(), 2)
    assert.match(await page.locator(".lp-event-card").innerText(), /Северный Пепел/)
    await page.locator(".lp-map-picker button").filter({hasText: "СТАРАЯ"}).click()
    assert.match(await page.locator(".lp-event-card").innerText(), /Каменный Перекрёсток/)
    assert.equal(await page.evaluate(() => localStorage.getItem("battle_map:920000001")), "team-battle")
    await page.locator(".lp-map-picker button").filter({hasText: "СЕВЕР"}).click()
    assert.match(await page.locator(".lp-event-card").innerText(), /Северный Пепел/)
    assert.equal(await page.evaluate(() => localStorage.getItem("battle_map:920000001")), "team-battle-northern")
    await page.screenshot({path: output, fullPage: true})
    assert.deepEqual(consoleErrors, [])
    assert.deepEqual(pageErrors, [])
    process.stdout.write(JSON.stringify({selectedMap: await page.evaluate(() => localStorage.getItem("battle_map:920000001")), output, consoleErrors, pageErrors}, null, 2))
  },
).catch(error => {
  console.error(error)
  process.exitCode = 1
})
