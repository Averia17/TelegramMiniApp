const fs = require("fs")
const path = require("path")
const { chromium } = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))

const ROOT = path.resolve(__dirname, "../..")
const HARNESS = process.env.HARNESS_URL || "http://localhost/test/glb-hero-harness.html"
const OUT = path.join(ROOT, "artifacts", "hero-browser-qa", "final")
const heroes = [
  ["Needle", "needle"],
  ["Mandy", "mandy"],
  ["Fairy Mina", "fairy-mina"],
  ["Brock Zeus", "brock-zeus"],
  ["Kaze", "kaze"],
  ["Wukong Mico", "wukong-mico"],
  ["Persephone Lumi", "persephone-lumi"],
]
const checks = [
  ["Покой", "idle"],
  ["Бег", "run"],
  ["Основная атака", "Attack"],
  ["Супер", "super"],
  ["Gadget", "Gadget"],
  ["Появление", "Spawn"],
  ["Получил удар", "hit"],
  ["Победа", "Victory"],
  ["Поражение", "death"],
  ["Прицел", "Aim"],
  ["Прицел супер", "AimSuper"],
]

fs.mkdirSync(OUT, { recursive: true })

function buttonClick(page, label) {
  return page.evaluate((buttonLabel) => {
    const button = [...document.querySelectorAll("button")].find(
      (item) => item.textContent.trim() === buttonLabel,
    )
    if (!button) throw new Error(`Missing harness button: ${buttonLabel}`)
    button.click()
  }, label)
}

(async () => {
  const browser = await chromium.launch({ headless: true })
  const results = []
  try {
    for (const [hero, slug] of heroes) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
      const consoleErrors = []
      const pageErrors = []
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text())
      })
      page.on("pageerror", (error) => pageErrors.push(String(error)))
      const row = { hero, slug, clips: [], checks: [], consoleErrors, pageErrors }
      try {
        await page.goto(`${HARNESS}?hero=${encodeURIComponent(slug)}`, {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        })
        await page.waitForFunction(() => window.qa && window.qa.clips && window.qa.clips.length > 0, { timeout: 15000 })
        row.clips = await page.evaluate(() => window.qa.clips.slice())
        for (const [label, expectedClip] of checks) {
          await buttonClick(page, label)
          await page.waitForTimeout(180)
          const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()))
          const expectedWeight = {
            idle: state.actionWeights.idle,
            run: state.actionWeights.run,
            Attack: state.actionWeights.attack,
            super: state.actionWeights.super,
            Gadget: state.actionWeights.gadget,
            Spawn: state.actionWeights.spawn,
            hit: state.actionWeights.hit,
            Victory: state.actionWeights.victory,
            death: state.actionWeights.defeat,
            Aim: state.actionWeights.aim,
            AimSuper: state.actionWeights.aimSuper,
          }[expectedClip] || 0
          const valid = row.clips.includes(expectedClip)
            && (state.fallbackEvents || []).length === 0
            && expectedWeight > 0
            && consoleErrors.length === 0
            && pageErrors.length === 0
          row.checks.push({ label, expectedClip, valid, weight: expectedWeight, fallbackEvents: state.fallbackEvents || [] })
          if (["Основная атака", "Супер", "Gadget"].includes(label)) {
            await page.screenshot({ path: path.join(OUT, `${slug}-${expectedClip}.png`), fullPage: true })
          }
        }
      } catch (error) {
        row.error = String(error)
      }
      results.push(row)
      await page.close()
    }
  } finally {
    await browser.close()
  }
  const output = path.join(ROOT, "artifacts", "hero-browser-qa", "final-matrix.json")
  const invalid = results.flatMap((row) => row.checks.filter((check) => !check.valid).map((check) => ({ hero: row.slug, ...check })))
  fs.writeFileSync(output, JSON.stringify({ scenes: results.reduce((sum, row) => sum + row.checks.length, 0), invalid: invalid.length, results }, null, 2))
  console.log(JSON.stringify({ scenes: results.reduce((sum, row) => sum + row.checks.length, 0), invalid: invalid.length, output, screenshots: OUT }))
  if (invalid.length || results.some((row) => row.error || row.consoleErrors.length || row.pageErrors.length)) process.exitCode = 1
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
