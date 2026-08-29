const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.HERO_SELECT_QA_URL || "http://localhost:5173"
const output = path.resolve(__dirname, "../../output/playwright/hero-select-card.png")
const heroCatalog = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../docs/hero-catalog.json"), "utf8"))

// Keep the browser fixture on the same source of truth as the audited roster.
// The real endpoint exposes the flattened Hero wire model, while the catalog
// document stores the balance and kit sections in a review-friendly shape.
const heroes = heroCatalog.heroes.map(hero => ({
  name: hero.name,
  displayName: hero.name.toUpperCase(),
  rarity: hero.identity.role === "Sharpshooter" ? "mythic" : hero.identity.role === "Assassin" ? "legendary" : "rare",
  title: hero.identity.role,
  attackDescription: hero.abilities.basic.description,
  superDescription: hero.abilities.super.description,
  passiveDescription: hero.description,
  color: hero.identity.color,
  radius: hero.identity.radius,
  maxLives: hero.balance.maxLives,
  speed: hero.balance.speed,
  attackDamage: hero.balance.attackDamage,
  attackRate: hero.balance.attackRateMs,
  reloadTime: hero.balance.reloadTimeMs,
  maxAmmo: hero.balance.maxAmmo,
  bulletSpeed: hero.balance.bulletSpeed,
  bulletSize: hero.balance.bulletSize,
  attackType: hero.balance.attackType,
  role: hero.identity.role,
  desc: hero.description,
  regenRate: hero.balance.regenRate,
  attack: hero.basicAttack,
  kit: {
    basic: hero.abilities.basic,
    super: hero.abilities.super,
    gadget: hero.abilities.gadget,
  },
}))

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    const page = await browser.newPage({viewport: {width: 1400, height: 900}})
    const consoleErrors = []
    const pageErrors = []
    const glbRequests = []
    page.on("console", message => {
      if (message.type() === "error") consoleErrors.push(message.text())
    })
    page.on("pageerror", error => pageErrors.push(error.stack || String(error)))
    page.on("request", request => {
      if (new URL(request.url()).pathname.endsWith(".glb")) glbRequests.push(request.url())
    })

    await page.route("**/api/**", async route => {
      const pathname = new URL(route.request().url()).pathname
      if (pathname.endsWith("/auth/telegram")) {
        return route.fulfill({json: {access_token: "qa", user_id: 920000001}})
      }
      if (pathname.endsWith("/economy/me")) {
        return route.fulfill({json: {
          energy: 100,
          max_energy: 100,
          gold: 0,
          crystals: 0,
          taunt_charges: 0,
          next_energy_in: 0,
        }})
      }
      if (pathname.endsWith("/heroes")) return route.fulfill({json: heroes})
      return route.fulfill({json: {}})
    })

    await page.goto(`${baseUrl}/?devUser=920000001`, {waitUntil: "domcontentloaded"})
    await page.locator(".hero-roster-button").click()
    const cards = page.locator(".hero-roster .hero-card")
    await cards.first().waitFor()
    await page.waitForFunction(
      () => document.querySelectorAll(".hero-card .hero-model-preview--loading").length === 0,
      null,
      {timeout: 30_000},
    )

    const cardCount = await cards.count()
    const cardTexts = await cards.allInnerTexts()
    const combatTypes = await page.locator(".hero-card-combat-type").allInnerTexts()
    const selectedChecks = await page.locator(".hero-card--selected .hero-card-check").count()
    const footerLayout = await page.locator(".hero-card-footer").first().evaluate(element => {
      const footer = getComputedStyle(element)
      const name = getComputedStyle(element.querySelector("strong"))
      return {
        flexDirection: footer.flexDirection,
        justifyContent: footer.justifyContent,
        textAlign: footer.textAlign,
        nameFontSize: name.fontSize,
      }
    })
    assert.ok(cardCount > 0)
    assert.equal(await page.locator(".hero-card-rank, .hero-card-trophies").count(), 0)
    assert.ok(cardTexts.every(text => !/РАНГ|СИЛА|🏆/.test(text)))
    assert.deepEqual(combatTypes, [
      "ДАЛЬНИЙ БОЙ",
      "БЛИЖНИЙ БОЙ",
      "ДАЛЬНИЙ БОЙ",
      "ДАЛЬНИЙ БОЙ",
      "БЛИЖНИЙ БОЙ",
      "БЛИЖНИЙ БОЙ",
      "ДАЛЬНИЙ БОЙ",
      "ДАЛЬНИЙ БОЙ",
    ])
    assert.deepEqual(footerLayout, {
      flexDirection: "column",
      justifyContent: "center",
      textAlign: "center",
      nameFontSize: "14px",
    })
    assert.equal(selectedChecks, 1)

    const initialCanvasCount = await page.locator(".hero-roster .hero-model-canvas").count()
    await page.locator(".hero-roster-header button").click()
    await page.locator(".hero-roster--hidden").waitFor({state: "attached"})
    await page.locator(".hero-roster-button").click()
    await page.locator(".hero-roster .hero-card").first().waitFor()
    assert.equal(await page.locator(".hero-roster .hero-model-canvas").count(), initialCanvasCount)
    assert.equal(new Set(glbRequests).size, glbRequests.length)
    assert.deepEqual(consoleErrors, [])
    assert.deepEqual(pageErrors, [])

    fs.mkdirSync(path.dirname(output), {recursive: true})
    await page.screenshot({path: output, fullPage: true})
    console.log(JSON.stringify({cardCount, cardTexts, combatTypes, footerLayout, selectedChecks, glbRequests: glbRequests.length, screenshot: output}, null, 2))
  },
)
