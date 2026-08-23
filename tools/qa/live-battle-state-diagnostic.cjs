const path = require("node:path")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.HERO_LIVE_AUDIT_URL || "http://localhost"
const hero = process.env.HERO_LIVE_AUDIT_HERO || "Mandy"
const viewport = {
  width: Number(process.env.HERO_LIVE_AUDIT_WIDTH || 1440),
  height: Number(process.env.HERO_LIVE_AUDIT_HEIGHT || 900),
}
const user = String(930000000 + (Date.now() % 9000000))
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true, args: ["--use-gl=swiftshader", "--disable-gpu-sandbox"]}),
  async browser => {
    const page = await browser.newPage({viewport, deviceScaleFactor: 1})
    const errors = []
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()) })
    page.on("pageerror", error => errors.push(error.stack || String(error)))
    await page.addInitScript(({userId, heroName}) => {
      localStorage.setItem(`battle_mode:${userId}`, "solo")
      localStorage.setItem(`battle_hero:${userId}`, heroName)
      localStorage.removeItem(`battle_active:${userId}`)
    }, {userId: user, heroName: hero})
    await page.goto(`${baseUrl}/?devUser=${user}`, {waitUntil: "domcontentloaded", timeout: 30000})
    await page.locator(".lp-play-btn:not([disabled])").waitFor({timeout: 30000})
    await page.locator(".lp-play-btn:not([disabled])").click()
    await page.waitForTimeout(7000)
    const fallbackFindMatch = await page.evaluate(({heroName}) => {
      const client = window.__battleClient
      const state = client?.lastState
      if (client?.connected && client?.playerId == null && !state?.game?.roomName) {
        client.findMatch("QA", heroName, {})
        return true
      }
      return false
    }, {heroName: hero})
    const samples = []
    for (const delay of [7000, 9000, 12000, 16000, 22000, 30000]) {
      await page.waitForTimeout(delay - (samples.at(-1)?.delay || 7000))
      samples.push({delay, href: page.url(), body: (await page.locator("body").innerText()).slice(0, 1200), debug: await page.evaluate(() => {
        const client = window.__battleClient
        const state = client?.lastState || window.__battleRenderer?.impl?.state || null
        const local = state?.players?.[client?.playerId]
        return {
          connected: client?.connected || false,
          playerId: client?.playerId || null,
          game: state?.game || null,
          players: Object.keys(state?.players || {}),
          local: local ? {hero: local.hero, lives: local.lives, x: local.x, y: local.y} : null,
          view: document.querySelector(".battle-shell")?.className || null,
          overlays: [...document.querySelectorAll("[class*=lobby], [class*=battle-loading], [class*=match]")].map(node => ({className: node.className, text: node.textContent?.slice(0, 160)})),
          canvases: document.querySelectorAll("canvas").length,
        }
      })})
    }
    await page.screenshot({path: path.resolve(__dirname, "../../output/playwright/hero-live-skill-audit/state-diagnostic.png"), fullPage: true})
    console.log(JSON.stringify({baseUrl, hero, user, fallbackFindMatch, samples, errors}, null, 2))
    await page.evaluate(() => window.__battleClient?.leaveBattle?.()).catch(() => {})
    await page.close()
  },
  {maxRuntimeMs: 90000},
)
