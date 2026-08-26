const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.BROCK_ZEUS_QA_URL || "http://localhost"
const output = path.resolve(__dirname, "../../output/playwright/brock-zeus-preview-pose")

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    fs.mkdirSync(output, {recursive: true})
    const page = await browser.newPage({viewport: {width: 435, height: 432}, deviceScaleFactor: 1})
    const pageErrors = []
    const modelRequests = []
    page.on("pageerror", error => pageErrors.push(error.stack || String(error)))
    page.on("request", request => {
      if (/brock-zeus/i.test(request.url())) modelRequests.push(request.url())
    })
    await page.route("**/api/**", async route => {
      const pathname = new URL(route.request().url()).pathname
      if (pathname.endsWith("/auth/telegram")) return route.fulfill({json: {access_token: "qa", user_id: 920000001}})
      if (pathname.endsWith("/economy/me")) return route.fulfill({json: {energy: 100, max_energy: 100, gold: 0, crystals: 0, taunt_charges: 0, next_energy_in: 0}})
      if (pathname.endsWith("/heroes")) return route.fulfill({json: [{
        name: "Brock Zeus", displayName: "Brock Zeus", rarity: "LEGENDARY", color: "#62f3ff",
        role: "Attacker", maxLives: 640, speed: 14, attackDamage: 52,
        title: "QA PREVIEW", attackDescription: "Проверка", superDescription: "Проверка", passiveDescription: "Проверка",
        attack: {archetype: "projectile"},
      }]})
      return route.fulfill({json: {}})
    })
    await page.goto(`${baseUrl}/?devUser=920000001`, {waitUntil: "domcontentloaded", timeout: 30000})
    await page.locator(".hero-model-canvas").waitFor({timeout: 30000})
    await page.waitForTimeout(1200)
    const previewCanvases = page.locator(".hero-model-canvas")
    const canvasCount = await previewCanvases.count()
    const canvasBox = canvasCount ? await previewCanvases.last().boundingBox() : null
    if (canvasBox) await page.screenshot({path: path.join(output, "brock-zeus-preview-canvas.png"), clip: canvasBox})
    await page.screenshot({path: path.join(output, "brock-zeus-preview-435x432.png"), fullPage: true})
    const previewGeometry = await page.evaluate(() => {
      const canvas = document.querySelector(".hero-model-canvas")
      const controller = [...document.querySelectorAll("canvas")].find(item => item !== canvas)?.__heroController
      return {
        canvasCount: document.querySelectorAll(".hero-model-canvas").length,
        canvasRect: canvas?.getBoundingClientRect().toJSON?.() || null,
      }
    })
    assert.equal(pageErrors.length, 0, pageErrors.join("\n"))
    console.log(JSON.stringify({output, pageErrors, modelRequests, previewGeometry}))
    await page.close()
  },
).catch(error => {
  console.error(error)
  process.exitCode = 1
})
