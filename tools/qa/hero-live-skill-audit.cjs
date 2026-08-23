const fs = require("node:fs")
const path = require("node:path")
const assert = require("node:assert/strict")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const ROOT = path.resolve(__dirname, "../..")
const BASE_URL = process.env.HERO_LIVE_AUDIT_URL || "http://127.0.0.1:5173"
const OUTPUT = path.join(ROOT, "output", "playwright", "hero-live-skill-audit")
const ALL_HEROES = [
  "Needle",
  "Mandy",
  "Fairy Mina",
  "Brock Zeus",
  "Kaze",
  "Wukong Mico",
  "Persephone Lumi",
  "Katty",
]
const heroes = process.env.HERO_LIVE_AUDIT_HERO
  ? [process.env.HERO_LIVE_AUDIT_HERO]
  : ALL_HEROES

const slug = value => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

const readBattle = page => page.evaluate(() => {
  const client = window.__battleClient
  const state = client?.lastState || window.__battleRenderer?.impl?.state || null
  const local = state?.players?.[client?.playerId] || null
  const effects = Array.isArray(state?.effects) ? state.effects : []
  const renderer = window.__battleRenderer?.impl
  return {
    gameState: state?.game?.state || null,
    hero: local?.hero || null,
    playerId: client?.playerId || null,
    local: local ? {
      x: local.x,
      y: local.y,
      lives: local.lives,
      superCharge: local.superCharge,
      gadgetCharges: local.gadgetCharges,
      attack: local.attack,
      kit: local.kit,
      effects: effects.map(effect => ({kind: effect.kind, phase: effect.phase || null})),
    } : null,
    effects: effects.map(effect => ({
      id: effect.id,
      kind: effect.kind,
      phase: effect.phase || null,
      life: effect.life,
      maxLife: effect.maxLife,
      x: effect.x,
      y: effect.y,
      radius: effect.radius,
    })),
    renderedEffectKinds: renderer?.effects?.meshes ? [...renderer.effects.meshes.values()].map(mesh => mesh.userData?.kind).filter(Boolean) : [],
  }
})

const capture = async (page, hero, skill, phase, frames) => {
  const file = path.join(OUTPUT, `${slug(hero)}-${skill}-${phase}.png`)
  await page.screenshot({path: file, fullPage: true})
  frames.push({phase, file, state: await readBattle(page)})
}

async function auditHero(page, hero, index) {
  // The development auth adapter accepts numeric ids only. A numeric id also
  // keeps the hero preference key aligned with the authenticated player.
  const user = String(920000000 + ((Date.now() + index) % 9000000))
  await page.addInitScript(({userId, heroName}) => {
    localStorage.setItem(`battle_mode:${userId}`, "solo")
    localStorage.setItem(`battle_hero:${userId}`, heroName)
    localStorage.removeItem(`battle_active:${userId}`)
  }, {userId: user, heroName: hero})
  await page.goto(`${BASE_URL}/?devUser=${encodeURIComponent(user)}`, {waitUntil: "domcontentloaded", timeout: 30000})
  await page.locator(".lp-play-btn:not([disabled])").waitFor({timeout: 30000})
  await page.locator(".lp-play-btn:not([disabled])").click()
  await page.waitForFunction(() => {
    const client = window.__battleClient
    const state = client?.lastState
    const local = state?.players?.[client?.playerId]
    return state?.game?.state === "game" && local && client?.connected
  }, {timeout: 30000})
  await page.waitForTimeout(800)

  const frames = []
  const trigger = async (skill, activeWait, settleWait) => {
    const live = await page.evaluate(() => {
      const client = window.__battleClient
      const state = client?.lastState || window.__battleRenderer?.impl?.state
      return Boolean(client?.connected && client?.playerId && state?.players?.[client.playerId]?.lives > 0)
    })
    if (!live) {
      frames.push({phase: "skipped", skill, reason: "local player is no longer alive or synchronized", state: await readBattle(page)})
      return
    }
    await capture(page, hero, skill, "before", frames)
    const triggered = await page.evaluate(({skill}) => {
      const client = window.__battleClient
      const state = client?.lastState || window.__battleRenderer?.impl?.state
      const local = state?.players?.[client?.playerId]
      if (!client || !local || local.lives <= 0) return false
      const target = Object.values(state.players || {})
        .filter(player => String(player.playerId) !== String(client.playerId) && player.lives > 0)
        .sort((a, b) => Math.hypot(a.x - local.x, a.y - local.y) - Math.hypot(b.x - local.x, b.y - local.y))[0]
      const dx = target ? target.x - local.x : 1
      const dy = target ? target.y - local.y : 0
      const distance = Math.max(120, Math.min(520, Math.hypot(dx, dy)))
      const angle = Math.atan2(dy, dx)
      client.rotate(angle, distance)
      if (skill === "basic") client.shoot(angle, distance, false)
      else client.ability(skill === "super" ? "primary" : "secondary")
      return true
    }, {skill})
    if (!triggered) {
      frames.push({phase: "skipped", skill, reason: "local player disappeared before trigger", state: await readBattle(page)})
      return
    }
    await page.waitForTimeout(activeWait)
    await capture(page, hero, skill, "active", frames)
    await page.waitForTimeout(settleWait)
    await capture(page, hero, skill, "after", frames)
  }

  await trigger("basic", 120, 300)
  await trigger("super", 180, 900)
  await trigger("gadget", 180, 1400)
  const finalState = await readBattle(page)
  return {hero, frames, finalState}
}

runWithBrowser(
  () => launchHeadlessChromium(chromium, {
    headless: true,
    args: ["--use-gl=swiftshader", "--disable-gpu-sandbox"],
  }),
  async browser => {
    fs.mkdirSync(OUTPUT, {recursive: true})
    const report = []
    for (const [index, hero] of heroes.entries()) {
      const context = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1})
      const page = await context.newPage()
      const consoleErrors = []
      const pageErrors = []
      page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()) })
      page.on("pageerror", error => pageErrors.push(error.stack || String(error)))
      try {
        const result = await auditHero(page, hero, index)
        report.push({...result, status: "passed", consoleErrors, pageErrors})
      } catch (error) {
        const screenshot = path.join(OUTPUT, `${slug(hero)}-error.png`)
        await page.screenshot({path: screenshot, fullPage: true}).catch(() => {})
        report.push({hero, status: "blocked", error: error.stack || String(error), screenshot, consoleErrors, pageErrors})
      } finally {
        await page.evaluate(() => window.__battleClient?.leaveBattle?.()).catch(() => {})
        await page.waitForTimeout(150).catch(() => {})
        await context.close().catch(() => {})
      }
      fs.writeFileSync(path.join(OUTPUT, "report.partial.json"), JSON.stringify(report, null, 2))
    }
    const reportFile = path.join(OUTPUT, "report.json")
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2))
    const summary = report.map(item => ({
      hero: item.hero,
      observedHero: item.finalState?.hero || null,
      effects: [...new Set((item.frames || []).flatMap(frame => (frame.state?.effects || []).map(effect => effect.kind)))],
      renderedEffects: [...new Set((item.frames || []).flatMap(frame => frame.state?.renderedEffectKinds || []))],
      consoleErrors: item.consoleErrors,
      pageErrors: item.pageErrors,
      status: item.status,
      error: item.error || null,
    }))
    console.log(JSON.stringify({reportFile, output: OUTPUT, summary}, null, 2))
    assert.equal(report.length, heroes.length)
  },
  {maxRuntimeMs: 360000},
)
