const fs = require("node:fs")
const path = require("node:path")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.HERO_PHASE_AUDIT_URL || "http://127.0.0.1:5173"
const output = path.resolve(__dirname, "../../output/playwright/hero-animation-audit-v2")
const cases = [
  ["Mandy", {attack: 235, super: 1370, gadget: 270}],
  ["Kaze", {attack: 300, super: 335, gadget: 235}],
  ["Wukong Mico", {attack: 570, super: 805, gadget: 670}],
  ["Needle", {attack: 205, super: 540, gadget: 205}],
  ["Fairy Mina", {attack: 235, super: 840, gadget: 235}],
  ["Persephone Lumi", {attack: 470, super: 605, gadget: 440}],
  ["Brock Zeus", {attack: 205, super: 605, gadget: 335}],
  ["Katty", {attack: 235, super: 605, gadget: 305}],
]
const slug = value => value.toLowerCase().replaceAll(" ", "-")

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    fs.mkdirSync(output, {recursive: true})
    const errors = []
    for (const [hero, delays] of cases) {
      const page = await browser.newPage({viewport: {width: 1100, height: 900}, deviceScaleFactor: 1})
      page.on("console", message => { if (message.type() === "error") errors.push(`${hero}: ${message.text()}`) })
      page.on("pageerror", error => errors.push(`${hero}: ${error.stack || error}`))
      await page.route("**/api/battle/heroes", route => route.fulfill({json: [{name: hero}]}))
      await page.route("**/api/battle/map-preview", route => route.fulfill({json: {map: {width: 1024, height: 768, tileSize: 40, walls: []}}}))
      await page.goto(`${baseUrl}/test/glb-hero-harness?hero=${encodeURIComponent(hero)}`, {waitUntil: "domcontentloaded", timeout: 30000})
      await page.waitForFunction(() => document.querySelector("#status")?.classList.contains("ready"), {timeout: 30000})
      await page.waitForFunction(() => Boolean(window.qa?.player && window.qa?.battleRenderer), {timeout: 30000})
      await page.waitForTimeout(600)
      await page.evaluate(() => {
        window.qa.player.x = 350
        window.qa.player.y = 260
        window.qa.battleRenderer.cameraRig.preferredVertical = 8
        window.qa.battleRenderer.setState(window.qa.battleState)
      })
      await page.waitForTimeout(300)
      for (const skill of ["attack", "super", "gadget"]) {
        const prefix = `${slug(hero)}-${skill}`
        await page.locator(`[data-skill="${skill}"]`).click()
        await page.waitForTimeout(35)
        await page.screenshot({path: path.join(output, `${prefix}-start.png`)})
        await page.waitForTimeout(Math.max(0, delays[skill] - 35))
        await page.screenshot({path: path.join(output, `${prefix}-release.png`)})
        await page.waitForTimeout(300)
        await page.screenshot({path: path.join(output, `${prefix}-recover.png`)})
        await page.waitForTimeout(450)
      }
      await page.close()
    }
    console.log(JSON.stringify({output, errors}, null, 2))
    if (errors.length) process.exitCode = 1
  },
  {maxRuntimeMs: 180000},
).catch(error => {
  console.error(error)
  process.exitCode = 1
})
