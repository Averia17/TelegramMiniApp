const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.HERO_SKILL_QA_URL || "http://127.0.0.1:5173"
const output = path.resolve(__dirname, "../../output/playwright/hero-skill-animations")
const allHeroes = [
  ["Mandy", {attack: 235, super: 1370, gadget: 270}],
  ["Kaze", {attack: 300, super: 335, gadget: 235}],
  ["Wukong Mico", {attack: 570, super: 805, gadget: 670}],
  ["Needle", {attack: 205, super: 540, gadget: 205}],
  ["Fairy Mina", {attack: 235, super: 840, gadget: 235}],
  ["Persephone Lumi", {attack: 470, super: 605, gadget: 440}],
  ["Brock Zeus", {attack: 205, super: 605, gadget: 335}],
  ["Katty", {attack: 235, super: 605, gadget: 305}],
]
const requestedHero = process.env.HERO_SKILL_QA_HERO
const heroes = requestedHero
  ? allHeroes.filter(([hero]) => hero === requestedHero)
  : allHeroes
assert.ok(heroes.length, `Unknown HERO_SKILL_QA_HERO: ${requestedHero}`)

const slug = value => value.toLowerCase().replaceAll(" ", "-")

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    fs.mkdirSync(output, {recursive: true})
    const consoleErrors = []
    const pageErrors = []
    const results = []

    for (const [hero, releaseDelay] of heroes) {
      const page = await browser.newPage({viewport: {width: 1100, height: 900}, deviceScaleFactor: 1})
      page.on("console", message => {
        if (message.type() === "error") consoleErrors.push(`${hero}: ${message.text()}`)
      })
      page.on("pageerror", error => pageErrors.push(`${hero}: ${error.stack || error}`))
      await page.route("**/api/battle/heroes", route => route.fulfill({json: [{name: hero}]}))
      await page.route("**/api/battle/map-preview", route => route.fulfill({json: {
        map: {width: 1024, height: 768, tileSize: 40, walls: []},
      }}))
      await page.goto(`${baseUrl}/test/glb-hero-harness?hero=${encodeURIComponent(hero)}`, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      })
      await page.waitForFunction(() => document.querySelector("#status")?.classList.contains("ready"), {
        timeout: 30_000,
      })
      await page.waitForTimeout(1800)
      await page.evaluate(() => {
        window.qa.player.x = 350
        window.qa.player.y = 260
        window.qa.battleRenderer.setState(window.qa.battleState)
        window.qa.battleRenderer.cameraRig.preferredVertical = 14
      })
      await page.waitForTimeout(500)
      for (const skill of ["attack", "super", "gadget"]) {
        await page.locator(`[data-skill="${skill}"]`).click()
        await page.waitForTimeout(80)
        const state = await page.evaluate(() => window.qa.getView()?.animation?.overlay || null)
        assert.equal(state, skill, `${hero} did not start ${skill}; overlay=${state}`)
        await page.waitForTimeout(Math.max(0, releaseDelay[skill] - 80))
        await page.screenshot({path: path.join(output, `${slug(hero)}-${skill}.png`)})
        results.push({hero, skill, state})
        await page.waitForTimeout(450)
      }
      await page.close()
    }

    assert.deepEqual(pageErrors, [])
    assert.deepEqual(consoleErrors, [])
    process.stdout.write(JSON.stringify({results, consoleErrors, pageErrors, output}, null, 2))
  },
  {maxRuntimeMs: 120_000},
).catch(error => {
  console.error(error)
  process.exitCode = 1
})
