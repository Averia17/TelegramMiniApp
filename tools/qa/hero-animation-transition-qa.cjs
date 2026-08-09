const fs = require("fs")
const path = require("path")
const { chromium } = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const { launchHeadlessChromium, runWithBrowser } = require("./playwright-runner.cjs")

const ROOT = path.resolve(__dirname, "../..")
const HARNESS = process.env.HARNESS_URL || "http://localhost/test/glb-hero-harness.html"
const OUT = path.join(ROOT, "artifacts", "hero-browser-qa", "transitions")
const heroes = [
  ["Needle", "needle"],
  ["Mandy", "mandy"],
  ["Fairy Mina", "fairy-mina"],
  ["Brock Zeus", "brock-zeus"],
  ["Kaze", "kaze"],
  ["Wukong Mico", "wukong-mico"],
  ["Persephone Lumi", "persephone-lumi"],
]

const scenarios = [
  {
    name: "idle-to-run",
    steps: [["[data-animation=idle]", 180], ["[data-animation=run]", 320]],
    expect: state => state.actionWeights.run >= .8 && state.actionWeights.idle <= .2,
  },
  {
    name: "run-to-attack",
    steps: [["[data-animation=run]", 160], ["[data-skill=attack]", 320]],
    expect: state => state.overlay === "attack" && state.actionWeights.attack >= .8
      && state.actionWeights.idle <= .2 && state.actionWeights.run <= .2,
  },
  {
    name: "attack-to-idle",
    steps: [["[data-skill=attack]", 120], ["[data-animation=idle]", 760]],
    expect: state => state.overlay === null && state.actionWeights.attack <= .05
      && state.actionWeights.idle >= .8,
  },
  {
    name: "rapid-double-attack",
    steps: [["[data-skill=attack]", 90], ["[data-skill=attack]", 220]],
    expect: state => state.overlay === "attack" && state.actionWeights.attack >= .8,
  },
  {
    name: "aim-to-attack",
    steps: [["[data-animation=aim]", 180], ["[data-skill=attack]", 300]],
    expect: state => state.overlay === "attack" && state.actionWeights.attack >= .8
      && state.actionWeights.aim <= .2,
  },
  {
    name: "attack-interrupted-by-hit",
    steps: [["[data-skill=attack]", 100], ["[data-animation=hit]", 240]],
    expect: state => state.overlay === "hit" && state.actionWeights.hit >= .8
      && state.actionWeights.attack <= .2,
  },
  {
    name: "super-interrupted-by-spawn",
    steps: [["[data-skill=super]", 120], ["[data-animation=spawn]", 260]],
    expect: state => state.animation === "spawn" && state.actionWeights.spawn >= .8
      && state.actionWeights.super <= .2,
  },
]

fs.mkdirSync(OUT, { recursive: true })

async function click(page, selector) {
  await page.locator(selector).click()
}

async function readState(page) {
  return JSON.parse(await page.evaluate(() => window.render_game_to_text()))
}

(async () => {
  await runWithBrowser(
    () => launchHeadlessChromium(chromium, { headless: true }),
    async (browser) => {
      const results = []
    for (const [hero, slug] of heroes) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
      const consoleErrors = []
      const pageErrors = []
      page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()) })
      page.on("pageerror", error => pageErrors.push(String(error)))
      await page.goto(`${HARNESS}?hero=${encodeURIComponent(slug)}`, { waitUntil: "domcontentloaded", timeout: 15000 })
      await page.waitForFunction(() => window.qa && window.qa.clips && window.qa.clips.length > 0, { timeout: 15000 })
      for (const scenario of scenarios) {
        for (const [selector, delay] of scenario.steps) {
          await click(page, selector)
          await page.waitForTimeout(delay)
        }
        const state = await readState(page)
        const valid = scenario.expect(state)
          && state.fallbackEvents.length === 0
          && consoleErrors.length === 0
          && pageErrors.length === 0
        const file = `${slug}-${scenario.name}.png`
        if (slug === "mandy" || !valid) await page.screenshot({ path: path.join(OUT, file), fullPage: true })
        results.push({ hero, slug, scenario: scenario.name, valid, state, file: slug === "mandy" || !valid ? file : null })
      }
      await page.close()
    }
      const output = path.join(ROOT, "artifacts", "hero-browser-qa", "transition-matrix.json")
      const invalid = results.filter(item => !item.valid)
      fs.writeFileSync(output, JSON.stringify({ heroes: heroes.length, scenarios: scenarios.length, checks: results.length, invalid: invalid.length, results }, null, 2))
      console.log(JSON.stringify({ heroes: heroes.length, scenarios: scenarios.length, checks: results.length, invalid: invalid.length, output, screenshots: OUT }))
      if (invalid.length) process.exitCode = 1
    },
  )
})().catch(error => {
  console.error(error)
  process.exitCode = 1
})
