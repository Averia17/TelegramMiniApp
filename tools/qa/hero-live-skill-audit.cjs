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
    combatEvents: (Array.isArray(state?.combatEvents) ? state.combatEvents : [])
      .filter(event => String(event.sourceId || "") === String(client?.playerId || ""))
      .map(event => ({
        id: event.id,
        ts: event.ts,
        kind: event.kind,
        phase: event.phase || null,
        abilitySlot: event.abilitySlot || null,
        reason: event.reason || null,
        commandId: event.commandId || null,
        sourceId: event.sourceId || null,
        targetId: event.targetId || null,
        accepted: Boolean(event.accepted),
        resolved: Boolean(event.resolved),
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
  const trigger = async (skill, activeWait, settleWait, {required = true} = {}) => {
    const live = await page.evaluate(() => {
      const client = window.__battleClient
      const state = client?.lastState || window.__battleRenderer?.impl?.state
      const local = state?.players?.[client?.playerId]
      return {
        alive: Boolean(client?.connected && client?.playerId && local?.lives > 0),
        superCharge: Number(local?.superCharge || 0),
      }
    })
    if (!live.alive) {
      frames.push({phase: required ? "skipped" : "unavailable", skill, reason: "local player is no longer alive or synchronized", state: await readBattle(page)})
      return
    }
    if (skill === "super" && live.superCharge < 100) {
      frames.push({phase: "not-ready", skill, reason: `authoritative Super charge is ${live.superCharge}/100`, state: await readBattle(page)})
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
      if (skill === "basic") {
        const previousSequence = client.shootSequence
        client.shoot(angle, distance, false)
        return {kind: "attack", commandId: `${client.playerId}:shoot:${client.shootSequence}`, previousSequence}
      }
      return {
        kind: "ability",
        commandId: client.ability(
          skill === "super" ? "primary" : "secondary",
          undefined,
          {aimProvided: true, aimAngle: angle, aimDistance: distance},
        ),
      }
    }, {skill})
    if (!triggered) {
      frames.push({phase: "skipped", skill, reason: "local player disappeared before trigger", state: await readBattle(page)})
      return
    }
    const eventAcknowledged = await page.waitForFunction(({kind, commandId}) => {
      const client = window.__battleClient
      const events = client?.lastState?.combatEvents || []
      return events.some(event => String(event.sourceId || "") === String(client?.playerId || "")
        && event.kind === kind && event.commandId === commandId && event.accepted)
    }, triggered, {timeout: 1500}).then(() => true).catch(() => false)
    if (!eventAcknowledged) {
      frames.push({phase: "event-missing", skill, reason: `authoritative ${triggered.kind} acknowledgement was not observed`, state: await readBattle(page)})
      return
    }
    await page.waitForTimeout(activeWait)
    await capture(page, hero, skill, "active", frames)
    await page.waitForTimeout(settleWait)
    await capture(page, hero, skill, "after", frames)
  }

  await trigger("basic", 120, 300)
  // Gadgets are spawn-ready, while Super charge is earned during the fight.
  // Probe the resource that should be immediately available before the long
  // Super observation window, otherwise a bot kill can hide a broken gadget
  // path behind a misleading "passed" report.
  await trigger("gadget", 180, 1400)
  await trigger("super", 180, 900, {required: false})
  const finalState = await readBattle(page)
  return {hero, frames, finalState}
}

const launchAuditBrowser = () => launchHeadlessChromium(chromium, {
  headless: true,
  args: ["--use-gl=swiftshader", "--disable-gpu-sandbox"],
})

const auditOneHero = (hero, index) => runWithBrowser(
  launchAuditBrowser,
  async browser => {
    const context = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1})
    const page = await context.newPage()
    const consoleErrors = []
    const pageErrors = []
    page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()) })
    page.on("pageerror", error => pageErrors.push(error.stack || String(error)))
    try {
      const result = await auditHero(page, hero, index)
      const skipped = (result.frames || []).filter(frame => frame.phase === "skipped")
      const missingEvents = (result.frames || []).filter(frame => frame.phase === "event-missing")
      if (skipped.length || missingEvents.length) {
        const blocker = missingEvents.length ? "live-authority" : "gameplay-survival"
        const details = [
          skipped.length ? `skipped ${skipped.length} skill probe(s)` : "",
          missingEvents.length ? `missing ${missingEvents.length} authoritative acknowledgement(s)` : "",
        ].filter(Boolean).join("; ")
        return {...result, status: "blocked", blocker, error: `live skill audit ${details}`, consoleErrors, pageErrors}
      }
      return {...result, status: "passed", consoleErrors, pageErrors}
    } catch (error) {
      const screenshot = path.join(OUTPUT, `${slug(hero)}-error.png`)
      await page.screenshot({path: screenshot, fullPage: true}).catch(() => {})
      const message = error.stack || String(error)
      const infrastructureFailure = /Target page, context or browser has been closed|Execution context was destroyed|browser has been closed/i.test(message)
      return {
        hero,
        status: "blocked",
        blocker: infrastructureFailure ? "qa-infrastructure" : "gameplay-survival",
        error: message,
        screenshot,
        consoleErrors,
        pageErrors,
      }
    } finally {
      await page.evaluate(() => window.__battleClient?.leaveBattle?.()).catch(() => {})
      await page.waitForTimeout(150).catch(() => {})
      await context.close().catch(() => {})
    }
  },
  {maxRuntimeMs: Number(process.env.HERO_LIVE_AUDIT_TIMEOUT_MS || 180000)},
)

;(async () => {
  fs.mkdirSync(OUTPUT, {recursive: true})
  const report = []
  for (const [index, hero] of heroes.entries()) {
    try {
      report.push(await auditOneHero(hero, index))
    } catch (error) {
      const message = error.stack || String(error)
      report.push({hero, status: "blocked", blocker: "qa-infrastructure", error: message, consoleErrors: [], pageErrors: []})
    }
    fs.writeFileSync(path.join(OUTPUT, "report.partial.json"), JSON.stringify(report, null, 2))
    // Let the battle service finish room cleanup before the next isolated
    // browser process starts.
    await wait(750)
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
    blocker: item.blocker || null,
    error: item.error || null,
  }))
  console.log(JSON.stringify({reportFile, output: OUTPUT, summary}, null, 2))
  assert.equal(report.length, heroes.length)
})().catch(error => {
  console.error(error.stack || String(error))
  process.exitCode = 1
})
