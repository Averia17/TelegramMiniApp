const fs = require("fs")
const path = require("path")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))

const ROOT = path.resolve(__dirname, "../..")
const HARNESS = process.env.HARNESS_URL || "http://localhost:5173/test/glb-hero-harness.html"
const OUT = path.join(ROOT, "output", "playwright", "fairy-mina-animation-temporal-qa")
const allCases = [
  {name: "idle", kind: "animation", durationMs: 3000},
  {name: "run", kind: "animation", durationMs: 800},
  {name: "attack", kind: "skill", durationMs: 600},
  {name: "super", kind: "skill", durationMs: 1834},
  {name: "aim", kind: "animation", durationMs: 2000},
  {name: "aimSuper", kind: "animation", durationMs: 2000},
  {name: "hit", kind: "animation", durationMs: 400},
  {name: "spawn", kind: "animation", durationMs: 1500},
  {name: "victory", kind: "animation", durationMs: 2000},
  {name: "defeat", kind: "animation", durationMs: 1334},
  {name: "gadget", kind: "skill", durationMs: 467},
  {name: "aimGadget", kind: "animation", durationMs: 2000},
]
const requestedClip = process.env.FAIRY_MINA_TEMPORAL_CLIP_FILTER
const cases = requestedClip ? allCases.filter(item => item.name === requestedClip) : allCases
if (!cases.length) throw new Error(`unknown Fairy Mina temporal clip: ${requestedClip}`)
const captureScreenshots = Boolean(requestedClip) || process.env.FAIRY_MINA_TEMPORAL_SCREENSHOTS === "1"

fs.mkdirSync(OUT, {recursive: true})

async function camera(page, view) {
  await page.evaluate(viewName => {
    const presets = {
      diagonal: [4.5, 4.2, 7],
      front: [0, 3.8, 7.8],
      side: [7.8, 3.8, 0],
    }
    const position = presets[viewName]
    window.qa.camera.position.set(...position)
    window.qa.camera.lookAt(0, 1.3, 0)
    window.qa.camera.updateProjectionMatrix()
  }, view)
}

async function readState(page) {
  return page.evaluate(() => {
    const state = JSON.parse(window.render_game_to_text())
    return {
      ...state,
      renderFrame: window.qa.renderer.info.render.frame,
      renderCalls: window.qa.renderer.info.render.calls,
      modelVisible: window.qa.model.visible,
      modelBounds: window.qa.getBounds(),
    }
  })
}

(async () => {
  const browser = await chromium.launch({headless: true})
  const results = []
  const consoleErrors = []
  const pageErrors = []
  let currentItem = "unknown"
  try {
    for (const item of cases) {
      currentItem = item.name
      const page = await browser.newPage({viewport: {width: 1280, height: 720}, deviceScaleFactor: 1})
      page.on("console", message => {
        if (message.type() === "error") consoleErrors.push(`${currentItem}: ${message.text()}`)
      })
      page.on("pageerror", error => pageErrors.push(`${currentItem}: ${String(error)}`))
      try {
        await page.goto(`${HARNESS}?hero=fairy-mina`, {waitUntil: "domcontentloaded", timeout: 15000})
        await page.waitForFunction(() => window.qa && window.qa.clips && window.qa.clips.length === 12, {timeout: 15000})
        const ratios = item.name === "attack" ? [0, .2, .4, .45, .5, .8, 1.05] : [0, .2, .5, .8, 1.05]
        const samples = ratios.map(ratio => Math.round(item.durationMs * ratio))
        const timeline = []
        for (let index = 0; index < samples.length; index += 1) {
          const view = index === 2 ? "front" : index === 3 ? "side" : "diagonal"
          await camera(page, view)
          await page.evaluate(({name, seconds}) => window.qa.freezeAt(name, seconds), {
            name: item.name === "defeat" ? "defeat" : item.name,
            seconds: samples[index] / 1000,
          })
          const state = await readState(page)
          let screenshot = null
          if (captureScreenshots) {
            screenshot = path.join(OUT, `${item.name}-${String(index).padStart(2, "0")}-${view}.png`)
            await page.screenshot({path: screenshot, fullPage: true})
          }
          timeline.push({offsetMs: samples[index], view, state, screenshot})
        }
        results.push({item, timeline})
      } finally {
        await page.close()
      }
    }
  } finally {
    await browser.close()
  }

  const invalid = []
  for (const result of results) {
    const {item, timeline} = result
    for (const sample of timeline) {
      const {state} = sample
      if (!state.modelVisible || !state.modelBounds || state.modelBounds.some(value => !Number.isFinite(value) || value < .01)
        || state.renderFrame <= 0 || state.renderCalls <= 0 || state.fallbackEvents.length > 0
        || (state.hero === "Fairy Mina" && state.heldProjectile)) {
        invalid.push({name: item.name, offsetMs: sample.offsetMs, reason: "blank-or-runtime-invalid", screenshot: sample.screenshot, state})
      }
    }
    const activeSamples = timeline.filter(sample => sample.offsetMs < item.durationMs * .9)
    if (item.kind === "skill" && !activeSamples.some(sample => Number(sample.state.actionWeights[item.name] || 0) > .02)) {
      invalid.push({name: item.name, reason: "skill-action-never-active", timeline})
    }
  }
  const report = {hero: "fairy-mina", cases: results.length, results, consoleErrors, pageErrors, invalid}
  const reportPath = path.join(OUT, "report.json")
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({hero: report.hero, cases: results.length, invalid: invalid.length, consoleErrors: consoleErrors.length, pageErrors: pageErrors.length, report: reportPath}))
  if (invalid.length || consoleErrors.length || pageErrors.length) process.exitCode = 1
})().catch(error => {
  console.error(error)
  process.exitCode = 1
})
