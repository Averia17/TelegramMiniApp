const fs = require("fs")
const path = require("path")
const { chromium } = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))

const ROOT = path.resolve(__dirname, "../..")
const OUT = path.join(ROOT, "artifacts", "hero-browser-qa", "quality-v5")
const heroes = [
  ["Needle", "needle"],
  ["Mandy", "mandy"],
  ["Fairy Mina", "fairy-mina"],
  ["Brock Zeus", "brock-zeus"],
  ["Kaze", "kaze"],
  ["Wukong Mico", "wukong-mico"],
  ["Persephone Lumi", "persephone-lumi"],
]
const skills = [
  ["attack", "Attack"],
  ["super", "super"],
  ["gadget", "Gadget"],
]

fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true })
  const results = []
  try {
    for (const [hero, slug] of heroes) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
      const consoleErrors = []
      const pageErrors = []
      const apiWarnings = []
      page.on("console", message => {
        if (message.type() === "error") consoleErrors.push(message.text())
      })
      page.on("pageerror", error => pageErrors.push(String(error)))
      page.on("response", response => {
        if (response.url().includes("/api/battle/heroes") && response.status() >= 400) apiWarnings.push(response.status())
      })
      await page.goto(`http://localhost:5173/test/glb-hero-harness.html?hero=${encodeURIComponent(hero)}`, { waitUntil: "domcontentloaded" })
      await page.waitForFunction(() => window.qa && window.qa.clips && window.qa.clips.length > 0)
      for (const [skill, clip] of skills) {
        await page.evaluate(skillName => window.qa.triggerSkill(skillName), skill)
        await page.waitForTimeout(350)
        const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()))
        const screenshot = path.join(OUT, `${slug}-${skill}.png`)
        await page.screenshot({ path: screenshot, fullPage: true })
        const expected = state.clips.includes(clip) && state.fallbackEvents.length === 0 && state.overlay === skill && state.actionWeights[skill] > 0
        const unexpectedConsoleErrors = consoleErrors.filter(message => !message.includes("500 (Internal Server Error)"))
        results.push({ hero, slug, skill, expectedClip: clip, state, screenshot, consoleErrors: [...consoleErrors], pageErrors: [...pageErrors], apiWarnings: [...apiWarnings], valid: expected && unexpectedConsoleErrors.length === 0 && pageErrors.length === 0 })
      }
      await page.close()
    }
  } finally {
    await browser.close()
  }
  const output = path.join(ROOT, "artifacts", "hero-browser-qa", "skill-quality-matrix-v5.json")
  fs.writeFileSync(output, JSON.stringify({ generatedAt: new Date().toISOString(), scenes: results.length, invalid: results.filter(item => !item.valid).length, results }, null, 2))
  console.log(JSON.stringify({ scenes: results.length, invalid: results.filter(item => !item.valid).length, output, screenshots: OUT }))
  if (results.some(item => !item.valid)) process.exitCode = 1
})().catch(error => {
  console.error(error)
  process.exitCode = 1
})
