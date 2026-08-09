const fs = require("node:fs")
const path = require("node:path")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const ROOT = path.resolve(__dirname, "../..")
const BASE_URL = process.env.BATTLE_QA_URL || "http://localhost"
const DEV_USER = process.env.BATTLE_QA_USER || String(900000000 + Math.floor(Math.random() * 9999999))
const OUTPUT = path.join(ROOT, "output", "playwright", "battle-performance")

const readBattleText = page => page.evaluate(() => {
  const value = window.render_game_to_text?.()
  return value ? JSON.parse(value) : null
})

const summarizeCpuProfile = profile => {
  const nodeById = new Map((profile?.nodes || []).map(node => [node.id, node]))
  const selfTimeById = new Map()
  let time = 0
  ;(profile?.samples || []).forEach((nodeId, index) => {
    const delta = Number(profile.timeDeltas?.[index] || 0)
    selfTimeById.set(nodeId, (selfTimeById.get(nodeId) || 0) + delta)
    time += delta
  })
  return [...selfTimeById.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([nodeId, selfTime]) => {
      const frame = nodeById.get(nodeId)?.callFrame || {}
      return {selfMs: selfTime / 1000, functionName: frame.functionName, url: frame.url, line: frame.lineNumber}
    })
}

const summarizeLongTasks = entries => {
  const durations = entries.map(entry => entry.duration).sort((a, b) => a - b)
  if (!durations.length) return {count: 0, maxMs: 0, p95Ms: 0, samples: []}
  const p95Index = Math.min(durations.length - 1, Math.ceil(durations.length * .95) - 1)
  return {
    count: durations.length,
    maxMs: durations.at(-1),
    p95Ms: durations[p95Index],
    samples: entries.slice(-10),
  }
}

const summarizeTrace = trace => {
  const groups = new Map()
  for (const event of trace?.traceEvents || []) {
    if (event.ph !== "X" || Number(event.dur) < 5000) continue
    const key = `${event.name}:${event.cat || ""}`
    const group = groups.get(key) || {
      name: event.name,
      category: event.cat || "",
      count: 0,
      totalMs: 0,
      maxMs: 0,
      sample: event.args?.data || event.args || {},
    }
    const durationMs = Number(event.dur) / 1000
    group.count += 1
    group.totalMs += durationMs
    group.maxMs = Math.max(group.maxMs, durationMs)
    groups.set(key, group)
  }
  return [...groups.values()]
    .sort((a, b) => b.totalMs - a.totalMs)
    .slice(0, 30)
}

const readTraceStream = async (session, stream) => {
  let json = ""
  while (true) {
    const chunk = await session.send("IO.read", {handle: stream})
    json += chunk.data || ""
    if (chunk.eof) break
  }
  await session.send("IO.close", {handle: stream})
  return JSON.parse(json)
}

runWithBrowser(
  () => launchHeadlessChromium(chromium, {
    headless: true,
    args: [
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
    ],
  }),
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
    const heroIndex = Math.floor(Math.random() * await cards.count())
    const hero = (await cards.nth(heroIndex).innerText()).split("\n").filter(Boolean).at(-2)
    await cards.nth(heroIndex).click()
    await page.locator(".lp-play-btn").click()
    await page.waitForFunction(() => {
      const value = window.render_game_to_text?.()
      return value && JSON.parse(value).mode === "game"
    }, {timeout: 30000})

    if (process.env.BATTLE_QA_DISABLE_UI_ANIMATIONS === "1") {
      await page.addStyleTag({content: "*,*::before,*::after{animation:none!important;transition:none!important}"})
    }

    await page.waitForTimeout(2500)
    // Exclude initial WebGL/GLB/map startup from steady-state gameplay
    // metrics. The startup path is validated separately by the UI tests.
    await page.evaluate(() => {
      window.__battlePerf = {}
      window.__battleLongTasks = []
      if (PerformanceObserver.supportedEntryTypes.includes("longtask")) {
        const observer = new PerformanceObserver(list => {
          list.getEntries().forEach(entry => window.__battleLongTasks.push({
            duration: entry.duration,
            startTime: entry.startTime,
            attribution: entry.attribution?.map(item => ({name: item.name, containerType: item.containerType})) || [],
          }))
        })
        observer.observe({entryTypes: ["longtask"]})
      }
    })
    const enableCpuProfile = process.env.BATTLE_QA_PROFILE === "1"
    const enableTrace = process.env.BATTLE_QA_TRACE === "1"
    const profiler = enableCpuProfile ? await page.context().newCDPSession(page) : null
    if (profiler) {
      await profiler.send("Profiler.enable")
      await profiler.send("Profiler.start")
    }
    const traceSession = enableTrace ? await page.context().newCDPSession(page) : null
    let traceComplete = null
    if (traceSession) {
      traceComplete = new Promise(resolve => traceSession.once("Tracing.tracingComplete", resolve))
      await traceSession.send("Tracing.start", {
        categories: "devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing",
        transferMode: "ReturnAsStream",
      })
    }
    const canvas = page.locator("canvas.battle-canvas")
    const box = await canvas.boundingBox()
    const moveMs = Math.max(500, Number(process.env.BATTLE_QA_MOVE_MS || 500))
    await page.keyboard.down("d")
    await page.waitForTimeout(moveMs)
    await page.keyboard.up("d")
    await page.mouse.click((box?.x || 0) + (box?.width || 0) * .7, (box?.y || 0) + (box?.height || 0) * .5)
    await page.keyboard.press("Space")
    await page.waitForTimeout(2500)
    const cpuProfile = profiler ? await profiler.send("Profiler.stop") : null
    let trace = null
    if (traceSession) {
      await traceSession.send("Tracing.end")
      const tracingComplete = await traceComplete
      trace = await readTraceStream(traceSession, tracingComplete.stream)
    }

    fs.mkdirSync(OUTPUT, {recursive: true})
    const screenshot = path.join(OUTPUT, `battle-${DEV_USER}.png`)
    await page.screenshot({path: screenshot, fullPage: true})
    const state = await readBattleText(page)
    const report = {
      hero,
      devUser: DEV_USER,
      url: page.url(),
      state,
      debug: await page.locator("[data-testid=battle-debug]").textContent().catch(() => null),
      longTasks: summarizeLongTasks(await page.evaluate(() => window.__battleLongTasks || [])),
      cpuProfileTop: cpuProfile ? summarizeCpuProfile(cpuProfile.profile) : null,
      traceLongTasks: trace ? summarizeTrace(trace) : null,
      browserDiagnostics: await page.evaluate(async () => ({
        visibilityState: document.visibilityState,
        elementCount: document.querySelectorAll("*").length,
        animationCount: document.getAnimations?.().length || 0,
        animations: document.getAnimations?.().map(animation => ({
          name: animation.animationName || animation.effect?.getKeyframes?.().length || "unknown",
          target: animation.effect?.target?.className || animation.effect?.target?.tagName || "unknown",
        })) || [],
        canvasCount: document.querySelectorAll("canvas").length,
        canvasClasses: [...document.querySelectorAll("canvas")].map(canvas => canvas.className),
        heroPreviewCount: document.querySelectorAll("[data-testid*=hero-preview], .hero-model-preview").length,
        rendererMemory: window.__battleRenderer?.impl?.renderer?.info?.memory || null,
        rendererPrograms: window.__battleRenderer?.impl?.renderer?.info?.programs?.length || 0,
        heroViews: [...(window.__battleRenderer?.impl?.players?.values?.() || [])].map(view => ({
          hero: view.state?.hero,
          usingFallback: view.usingFallback,
          hasAuthoredAnimation: Boolean(view.animation),
        })),
        mapRenderer: (() => {
          const map = window.__battleRenderer?.impl?.mapRenderer
          return map ? {
            focus: map.focus,
            objectCount: map.objects?.size || 0,
            debrisCount: map.debris?.length || 0,
          } : null
        })(),
        glbRequests: performance.getEntriesByType("resource")
          .filter(entry => /\.glb(?:\?|$)/i.test(entry.name))
          .map(entry => ({
            url: entry.name,
            durationMs: entry.duration,
            transferSize: entry.transferSize,
            decodedBodySize: entry.decodedBodySize,
          })),
      })),
      consoleErrors,
      pageErrors,
      screenshot,
    }
    console.log(JSON.stringify(report, null, 2))
    return report
  },
)
