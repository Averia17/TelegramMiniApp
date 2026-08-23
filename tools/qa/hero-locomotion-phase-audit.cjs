const fs = require("node:fs")
const path = require("node:path")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.HERO_PHASE_AUDIT_URL || "http://127.0.0.1:5173"
const output = path.resolve(__dirname, "../../output/playwright/hero-locomotion-audit")
const heroes = ["Mandy", "Kaze", "Wukong Mico", "Needle", "Fairy Mina", "Persephone Lumi", "Brock Zeus", "Katty"]
const slug = value => value.toLowerCase().replaceAll(" ", "-")

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    fs.mkdirSync(output, {recursive: true})
    const errors = []
    for (const hero of heroes) {
      const page = await browser.newPage({viewport: {width: 1100, height: 900}, deviceScaleFactor: 1})
      page.on("console", message => { if (message.type() === "error") errors.push(`${hero}: ${message.text()}`) })
      page.on("pageerror", error => errors.push(`${hero}: ${error.stack || error}`))
      await page.route("**/api/battle/heroes", route => route.fulfill({json: [{name: hero}]}))
      await page.route("**/api/battle/map-preview", route => route.fulfill({json: {map: {width: 1024, height: 768, tileSize: 40, walls: []}}}))
      await page.goto(`${baseUrl}/test/glb-hero-harness?hero=${encodeURIComponent(hero)}`, {waitUntil: "domcontentloaded", timeout: 30000})
      await page.waitForFunction(() => Boolean(window.qa?.player && window.qa?.battleRenderer), {timeout: 30000})
      await page.waitForTimeout(700)
      await page.evaluate(() => {
        window.qa.player.x = 350
        window.qa.player.y = 260
        window.qa.battleRenderer.cameraRig.preferredVertical = 8
        window.qa.battleRenderer.setState(window.qa.battleState)
      })
      for (const animation of ["idle", "run"]) {
        await page.locator(`[data-animation="${animation}"]`).click()
        await page.waitForTimeout(animation === "idle" ? 500 : 700)
        await page.screenshot({path: path.join(output, `${slug(hero)}-${animation}.png`)})
      }
      await page.close()
    }
    console.log(JSON.stringify({output, errors}, null, 2))
    if (errors.length) process.exitCode = 1
  },
  {maxRuntimeMs: 120000},
).catch(error => {
  console.error(error)
  process.exitCode = 1
})
