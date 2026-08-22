const fs = require("node:fs")
const path = require("node:path")
const assert = require("node:assert/strict")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const ROOT = path.resolve(__dirname, "../..")
const BASE_URL = process.env.ENERGY_QA_URL || "http://localhost:5173"
const WIDTH = Number(process.env.ENERGY_QA_WIDTH || 375)
const OUTPUT = path.join(ROOT, "output", "playwright", `energy-regeneration-${WIDTH}.png`)

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    const isMobile = WIDTH <= 520
    const page = await browser.newPage({viewport: {width: WIDTH, height: isMobile ? 667 : 900}, isMobile, hasTouch: isMobile})
    const consoleErrors = []
    const pageErrors = []
    page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()) })
    page.on("pageerror", error => pageErrors.push(error.stack || String(error)))

    await page.route("**/api/**", async route => {
      const pathname = new URL(route.request().url()).pathname
      if (pathname.endsWith("/auth/telegram")) return route.fulfill({json: {access_token: "qa", user_id: 920000042}})
      if (pathname.endsWith("/economy/me")) {
        return route.fulfill({json: {
          energy: 42,
          max_energy: 100,
          gold: 0,
          crystals: 0,
          taunt_charges: 0,
          next_energy_in: 299,
          next_energy_at: "2026-07-29T12:04:59.000Z",
          server_time: "2026-07-29T12:00:00.000Z",
        }})
      }
      if (pathname.endsWith("/heroes")) return route.fulfill({json: [{name: "Katty", displayName: "Katty", rarity: "LEGENDARY", color: "#d449b5", role: "Controller", maxLives: 640, speed: 14, attackDamage: 52, title: "STREET PAINT ARTIST", attackDescription: "Проверка", superDescription: "Проверка", passiveDescription: "Проверка", attack: {archetype: "ranged"}}]})
      if (pathname.endsWith("/party/mine")) return route.fulfill({json: {
        partyId: "qa-party",
        maxSize: 3,
        members: [
          {playerId: "920000042", name: "Player", hero: "Katty", owner: true},
          {playerId: "qa-friend", name: "ОченьДлинныйНикнеймКоторыйНеПомещается", hero: "Needle"},
        ],
      }})
      if (pathname.endsWith("/party/invites/outgoing")) return route.fulfill({json: {}})
      return route.fulfill({json: {}})
    })

    await page.goto(`${BASE_URL}/?devUser=920000042`, {waitUntil: "domcontentloaded"})
    const energy = page.locator(".lp-energy-popover")
    await energy.waitFor({timeout: 30000})
    const first = await energy.textContent()
    const initialCountdown = await energy.locator("small").textContent()
    assert.doesNotMatch(first, /\+1/)
    assert.match(first, /04:5\d/)
    if (WIDTH > 520) {
      await energy.hover()
    } else {
      await energy.click()
    }
    const tooltip = energy.locator(".interactive-popover__content")
    await tooltip.waitFor({state: "visible", timeout: 5000})
    assert.match(await tooltip.textContent(), /Энергия пополнится через 04:5\d/)
    await page.waitForFunction(initial => document.querySelector(".lp-currency--stacked small")?.textContent !== initial, initialCountdown, {timeout: 5000})
    const second = await energy.textContent()
    assert.notEqual(second, first, "energy countdown did not tick")
    const namePopovers = page.locator(".party-roster-widget__name-popover")
    await namePopovers.first().waitFor({timeout: 30000})
    const compactName = namePopovers.filter({hasText: "ТЫ"}).first()
    const longName = namePopovers.filter({hasText: "НеПомещается"}).first()
    assert.doesNotMatch(await compactName.getAttribute("class"), /is-overflowing/)
    assert.match(await longName.getAttribute("class"), /is-overflowing/)
    if (WIDTH > 520) {
      await compactName.hover()
    } else {
      await compactName.click()
    }
    assert.equal(await compactName.locator(".interactive-popover__content").isVisible(), false)
    if (WIDTH > 520) {
      await longName.hover()
    } else {
      await longName.click()
    }
    await longName.locator(".interactive-popover__content").waitFor({state: "visible", timeout: 5000})
    await page.locator(".lp-profile-chip").click()
    await tooltip.waitFor({state: "hidden", timeout: 5000})
    assert.deepEqual([...consoleErrors, ...pageErrors], [])

    fs.mkdirSync(path.dirname(OUTPUT), {recursive: true})
    await page.screenshot({path: OUTPUT, fullPage: true})
    console.log(JSON.stringify({output: OUTPUT, first, second}))
  },
)
