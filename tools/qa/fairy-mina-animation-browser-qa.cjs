const fs = require("fs")
const path = require("path")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))

const ROOT = path.resolve(__dirname, "../..")
const HARNESS = process.env.HARNESS_URL || "http://localhost:5173/test/glb-hero-harness.html"
const OUT = path.join(ROOT, "output", "playwright", "fairy-mina-animation-qa")
const cases = [
  {name: "idle", kind: "animation", expected: "idle", expectedKey: "idle", capture: true},
  {name: "run", kind: "animation", expected: "run", expectedKey: "run", capture: false},
  {name: "attack", kind: "skill", expected: "Attack", expectedKey: "attack", capture: true},
  {name: "super", kind: "skill", expected: "super", expectedKey: "super", capture: true},
  {name: "aim", kind: "animation", expected: "Aim", expectedKey: "aim", capture: true},
  {name: "aimSuper", kind: "animation", expected: "AimSuper", expectedKey: "aimSuper", capture: false},
  {name: "hit", kind: "animation", expected: "hit", expectedKey: "hit", capture: false},
  {name: "spawn", kind: "animation", expected: "Spawn", expectedKey: "spawn", capture: false},
  {name: "victory", kind: "animation", expected: "Victory", expectedKey: "victory", capture: true},
  {name: "defeat", kind: "animation", expected: "death", expectedKey: "defeat", capture: true},
  {name: "gadget", kind: "skill", expected: "Gadget", expectedKey: "gadget", capture: true},
  {name: "aimGadget", kind: "animation", expected: "AimGadget", expectedKey: "aimGadget", capture: true},
]

fs.mkdirSync(OUT, {recursive: true})

async function trigger(page, item) {
  if (item.kind === "skill") {
    await page.evaluate(skill => window.qa.triggerSkill(skill), item.name)
  } else {
    await page.locator(`button[data-animation="${item.name}"]`).click()
  }
}

(async () => {
  const browser = await chromium.launch({headless: true})
  const results = []
  const consoleErrors = []
  const pageErrors = []
  try {
    for (const item of cases) {
      const page = await browser.newPage({viewport: {width: 1280, height: 720}, deviceScaleFactor: 1})
      page.on("console", message => {
        if (message.type() === "error") consoleErrors.push(`${item.name}: ${message.text()}`)
      })
      page.on("pageerror", error => pageErrors.push(`${item.name}: ${String(error)}`))
      try {
        await page.goto(`${HARNESS}?hero=fairy-mina`, {waitUntil: "domcontentloaded", timeout: 15000})
        await page.waitForFunction(() => window.qa && window.qa.clips && window.qa.clips.length === 12, {timeout: 15000})
        const clips = await page.evaluate(() => window.qa.clips.slice().sort())
        const expectedClips = ["Aim", "AimGadget", "AimSuper", "Attack", "Gadget", "Spawn", "Victory", "death", "hit", "idle", "run", "super"]
        if (JSON.stringify(clips) !== JSON.stringify(expectedClips)) throw new Error(`unexpected clip list: ${clips.join(",")}`)
        await trigger(page, item)
        // Read the action immediately. Short one-shots such as hit are only
        // 12 frames; waiting before the first assertion makes this test
        // depend on screenshot/browser latency instead of runtime behavior.
        if (["aim", "aimSuper", "aimGadget"].includes(item.name)) await page.waitForTimeout(120)
        const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()))
        let screenshot = null
        if (item.capture) {
          screenshot = path.join(OUT, `${item.name}-active.png`)
          await page.screenshot({path: screenshot, fullPage: true})
        }
        results.push({item, state, screenshot})
      } finally {
        await page.close()
      }
    }
  } finally {
    await browser.close()
  }

  const invalid = results.filter(result => {
    const {item, state} = result
    return state.fallbackEvents.length > 0
      || !state.clips.includes(item.expected)
      || Number(state.actionWeights[item.expectedKey] || 0) <= 0
  })
  const report = {hero: "fairy-mina", clips: results.length, results, consoleErrors, pageErrors, invalid: invalid.length}
  const reportPath = path.join(OUT, "report.json")
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({hero: report.hero, clips: results.length, invalid: invalid.length, consoleErrors: consoleErrors.length, pageErrors: pageErrors.length, report: reportPath, screenshots: OUT}))
  if (invalid.length || consoleErrors.length || pageErrors.length) process.exitCode = 1
})().catch(error => {
  console.error(error)
  process.exitCode = 1
})
