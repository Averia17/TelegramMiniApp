const fs = require("node:fs")
const path = require("node:path")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const ROOT = path.resolve(__dirname, "../..")
const BASE_URL = process.env.COMBAT_FEEDBACK_QA_URL || "http://localhost"
const DEV_USER = process.env.COMBAT_FEEDBACK_QA_USER || String(920000000 + Math.floor(Math.random() * 9999999))
const OUTPUT = path.join(ROOT, "output", "playwright", "combat-feedback")

const readState = page => page.evaluate(() => window.__battleClient?.lastState || null)

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    const page = await browser.newPage({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1})
    const consoleErrors = []
    const pageErrors = []
    page.on("console", message => {
      if (message.type() === "error") consoleErrors.push(message.text())
    })
    page.on("pageerror", error => pageErrors.push(error.stack || String(error)))

    await page.goto(`${BASE_URL}/?devUser=${encodeURIComponent(DEV_USER)}`, {waitUntil: "domcontentloaded", timeout: 30000})
    await page.locator(".hero-roster-button").click()
    const cards = page.locator(".hero-roster .hero-card")
    await cards.nth(0).click()
    await page.locator(".lp-play-btn").click()
    await page.waitForFunction(() => {
      const value = window.render_game_to_text?.()
      return value && JSON.parse(value).mode === "game"
    }, {timeout: 30000})
    await page.waitForTimeout(1200)

    let hitEvents = []
    const deadline = Date.now() + 6500
    let nextShotAt = 0
    while (Date.now() < deadline) {
      await page.evaluate(() => {
        const client = window.__battleClient
        const state = client?.lastState
        const local = state?.players?.[client?.playerId]
        if (!client || !local) return
        const targets = Object.values(state.players || {})
          .filter(player => player.playerId !== client.playerId && player.lives > 0)
          .sort((a, b) => Math.hypot(a.x - local.x, a.y - local.y) - Math.hypot(b.x - local.x, b.y - local.y))
        const target = targets[0]
        if (!target) return
        const dx = target.x - local.x
        const dy = target.y - local.y
        const distance = Math.max(1, Math.hypot(dx, dy))
        const angle = Math.atan2(dy, dx)
        client.move(dx / distance, dy / distance)
        client.rotate(angle, distance)
        if (distance < 760 && performance.now() > (window.__combatFeedbackNextShot || 0)) {
          window.__combatFeedbackNextShot = performance.now() + 460
          client.shoot(angle, distance, false)
        }
      })
      const state = await readState(page)
      hitEvents = (state?.combatEvents || []).filter(event => event.kind === "hit" && event.damage > 0)
      if (hitEvents.length) break
      await page.waitForTimeout(120)
    }

    const syntheticFeedback = await page.evaluate(() => {
      const renderer = window.__battleRenderer?.impl
      const state = window.__battleClient?.lastState
      const localId = window.__battleClient?.playerId
      const target = state?.players?.[localId]
      if (!renderer || !state || !target) return null
      const event = {
        id: 987654321,
        kind: "hit",
        commandId: "qa:synthetic-hit",
        sourceId: "qa-opponent",
        targetType: "players",
        targetId: String(target.playerId),
        damage: 60,
      }
      renderer.setState({...state, combatEvents: [event]})
      renderer.render()
      return {
        targetId: event.targetId,
        feedbackCount: renderer.combatFeedback.feedback.size,
        cameraShake: renderer.cameraRig.shake,
      }
    })
    await page.waitForTimeout(160)
    fs.mkdirSync(OUTPUT, {recursive: true})
    const screenshot = path.join(OUTPUT, `combat-feedback-${DEV_USER}.png`)
    await page.screenshot({path: screenshot, fullPage: true})
    const report = {
      devUser: DEV_USER,
      hitEvents,
      feedbackCount: await page.evaluate(() => window.__battleRenderer?.impl?.combatFeedback?.feedback?.size || 0),
      cameraShake: await page.evaluate(() => window.__battleRenderer?.impl?.cameraRig?.shake || 0),
      syntheticFeedback,
      consoleErrors,
      pageErrors,
      screenshot,
    }
    console.log(JSON.stringify(report, null, 2))
    return report
  },
)
