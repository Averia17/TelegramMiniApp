const fs = require("fs")
const path = require("path")
const { chromium } = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const { launchHeadlessChromium, runWithBrowser } = require("./playwright-runner.cjs")

const ROOT = path.resolve(__dirname, "../..")
const HARNESS = process.env.HARNESS_URL || "http://localhost/test/glb-hero-harness.html"
const OUT = path.join(ROOT, "artifacts", "hero-browser-qa", "frame-sweep")
const allHeroes = [
  ["Needle", "needle"],
  ["Mandy", "mandy"],
  ["Fairy Mina", "fairy-mina"],
  ["Brock Zeus", "brock-zeus"],
  ["Kaze", "kaze"],
  ["Wukong Mico", "wukong-mico"],
  ["Persephone Lumi", "persephone-lumi"],
]
const allChecks = [
  [0, "idle"],
  [1, "run"],
  [2, "Attack"],
  [3, "super"],
  [4, "Gadget"],
  [5, "Spawn"],
  [6, "hit"],
  [7, "Victory"],
  [8, "death"],
  [9, "Aim"],
  [10, "AimSuper"],
]
const heroes = process.env.HERO_FILTER
  ? allHeroes.filter(([, slug]) => slug === process.env.HERO_FILTER)
  : allHeroes
const checks = process.env.CLIP_FILTER
  ? allChecks.filter(([, clip]) => clip === process.env.CLIP_FILTER)
  : allChecks
const delays = process.env.DELAYS
  ? process.env.DELAYS.split(",").map(value => Number(value.trim())).filter(Number.isFinite)
  : [60, 180, 360]

fs.mkdirSync(OUT, { recursive: true })

async function clickButton(page, index) {
  await page.evaluate((buttonIndex) => {
    const buttons = [...document.querySelectorAll("button")]
    const button = buttons[buttonIndex]
    if (!button) throw new Error(`Missing harness button index: ${buttonIndex}`)
    button.click()
  }, index)
}

(async () => {
  await runWithBrowser(
    () => launchHeadlessChromium(chromium, { headless: true }),
    async (browser) => {
      const report = []
    for (const [hero, slug] of heroes) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
      const consoleErrors = []
      const pageErrors = []
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text())
      })
      page.on("pageerror", (error) => pageErrors.push(String(error)))
      const row = { hero, slug, samples: [], consoleErrors, pageErrors }
      try {
        await page.goto(`${HARNESS}?hero=${encodeURIComponent(slug)}`, { waitUntil: "domcontentloaded", timeout: 15000 })
        await page.waitForFunction(() => window.qa && window.qa.clips && window.qa.clips.length > 0, { timeout: 15000 })
        for (const [buttonIndex, clip] of checks) {
          await clickButton(page, buttonIndex)
          for (const delay of delays) {
            await page.waitForTimeout(delay)
            const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()))
            const file = `${slug}-${clip}-${delay}ms.png`
            await page.screenshot({ path: path.join(OUT, file), fullPage: true })
            row.samples.push({ clip, delay, animation: state.animation, actionWeights: state.actionWeights, fallbackEvents: state.fallbackEvents || [], file })
          }
        }
      } catch (error) {
        row.error = String(error)
      }
      report.push(row)
      await page.close()
    }
      const output = path.join(ROOT, "artifacts", "hero-browser-qa", "frame-sweep.json")
      fs.writeFileSync(output, JSON.stringify({ heroes: heroes.length, clips: checks.length, delays, samples: report }, null, 2))
      const samples = report.flatMap((row) => row.samples)
      const invalid = samples.filter((sample) => sample.fallbackEvents.length > 0)
      console.log(JSON.stringify({ heroes: heroes.length, clips: checks.length, delays, samples: samples.length, invalid: invalid.length, output, screenshots: OUT }))
      if (invalid.length || report.some((row) => row.error || row.consoleErrors.length || row.pageErrors.length)) process.exitCode = 1
    },
  )
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
