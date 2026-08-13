const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.HERO_SELECT_QA_URL || "http://localhost:5173"
const output = path.resolve(__dirname, "../../output/playwright/hero-select-card.png")

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    const page = await browser.newPage({viewport: {width: 1400, height: 900}})
    const consoleErrors = []
    const pageErrors = []
    page.on("console", message => {
      if (message.type() === "error") consoleErrors.push(message.text())
    })
    page.on("pageerror", error => pageErrors.push(error.stack || String(error)))

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
      if (pathname.endsWith("/heroes")) return route.fulfill({json: []})
      return route.fulfill({json: {}})
    })

    await page.goto(`${baseUrl}/?devUser=920000001`, {waitUntil: "domcontentloaded"})
    await page.locator(".hero-roster-button").click()
    const cards = page.locator(".hero-roster .hero-card")
    await cards.first().waitFor()

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
    assert.deepEqual(consoleErrors, [])
    assert.deepEqual(pageErrors, [])

    fs.mkdirSync(path.dirname(output), {recursive: true})
    await page.screenshot({path: output, fullPage: true})
    console.log(JSON.stringify({cardCount, cardTexts, combatTypes, footerLayout, selectedChecks, screenshot: output}, null, 2))
  },
)
