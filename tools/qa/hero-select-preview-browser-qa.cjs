const fs = require("node:fs")
const path = require("node:path")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.HERO_SELECT_QA_URL || "http://127.0.0.1:5173"
const outputDir = path.resolve(__dirname, "../../output/playwright/hero-select-preview")
const heroes = [
  "Mandy", "Kaze", "Wukong Mico", "Needle", "Fairy Mina", "Persephone Lumi", "Brock Zeus", "Katty",
]

const heroData = name => ({
  name,
  displayName: name,
  rarity: "LEGENDARY",
  color: "#62f3ff",
  role: "Attacker",
  maxLives: 640,
  speed: 14,
  attackDamage: 52,
  title: "QA PREVIEW",
  attackDescription: "Проверка",
  superDescription: "Проверка",
  passiveDescription: "Проверка",
  attack: {archetype: "projectile"},
})

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    fs.mkdirSync(outputDir, {recursive: true})
    const results = []
    for (const hero of heroes) {
      const page = await browser.newPage({viewport: {width: 1400, height: 900}, deviceScaleFactor: 1})
      const consoleErrors = []
      const pageErrors = []
      page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()) })
      page.on("pageerror", error => pageErrors.push(error.stack || String(error)))
      await page.route("**/api/**", async route => {
        const pathname = new URL(route.request().url()).pathname
        if (pathname.endsWith("/auth/telegram")) return route.fulfill({json: {access_token: "qa", user_id: 920000001}})
        if (pathname.endsWith("/economy/me")) return route.fulfill({json: {energy: 100, max_energy: 100, gold: 0, crystals: 0, taunt_charges: 0, next_energy_in: 0}})
        if (pathname.endsWith("/heroes")) return route.fulfill({json: [heroData(hero)]})
        return route.fulfill({json: {}})
      })
      await page.goto(`${baseUrl}/?devUser=920000001`, {waitUntil: "domcontentloaded", timeout: 30000})
      await page.locator(".hero-model-canvas").waitFor({timeout: 30000})
      await page.waitForTimeout(1200)
      const frames = []
      for (const index of [0, 1, 2, 3, 4]) {
        const output = path.join(outputDir, `${hero.toLowerCase().replace(/\s+/g, "-")}-${index}.png`)
        await page.screenshot({path: output, fullPage: true})
        frames.push(output)
        await page.waitForTimeout(120)
      }
      results.push({hero, canvases: await page.locator(".hero-model-canvas").count(), frames, consoleErrors, pageErrors})
      await page.close()
    }
    const resultPath = path.join(outputDir, "results.json")
    fs.writeFileSync(resultPath, JSON.stringify(results, null, 2))
    console.log(JSON.stringify({resultPath, results}, null, 2))
    if (results.some(result => result.consoleErrors.length || result.pageErrors.length)) process.exitCode = 1
  },
).catch(error => {
  console.error(error)
  process.exitCode = 1
})
