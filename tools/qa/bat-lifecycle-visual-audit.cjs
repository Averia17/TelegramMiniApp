const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.BAT_QA_URL || "http://localhost"
const output = path.resolve(__dirname, "../../output/playwright/bat-lifecycle-visual-audit")

const states = [
  ["patrol", "patrol"],
  ["notice", "notice"],
  ["windup", "windup"],
]

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true, args: ["--use-gl=swiftshader", "--disable-gpu-sandbox"]}),
  async browser => {
    fs.mkdirSync(output, {recursive: true})
    const context = await browser.newContext({viewport: {width: 900, height: 700}, deviceScaleFactor: 1})
    const page = await context.newPage()
    const consoleErrors = []
    const pageErrors = []
    page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()) })
    page.on("pageerror", error => pageErrors.push(error.message))

    await page.goto(`${baseUrl}/test/glb-hero-harness?hero=Needle`, {waitUntil: "domcontentloaded", timeout: 30000})
    await page.waitForFunction(() => document.querySelector("#status")?.classList.contains("ready"), {timeout: 30000})
    await page.waitForTimeout(260)
    await page.evaluate(() => {
      const player = window.qa.player
      player.x = window.qa.map?.width ? window.qa.map.width * .5 : 480
      player.y = window.qa.map?.height ? window.qa.map.height * .5 : 480
      window.qa.battleRenderer.setState(window.qa.battleState)
      window.qa.battleRenderer.render()
      document.querySelector("#toggle")?.click()
    })

    const reports = []
    for (const [label, batState] of states) {
      const screenshot = path.join(output, `${label}.png`)
      const report = await page.evaluate(({batState, label}) => {
        const state = window.qa.battleState
        const player = state.players.qa
        state.monsters = {
          bat: {
            x: player.x + 120,
            y: player.y,
            radius: 18,
            lives: 4,
            maxLives: 4,
            tier: 1,
            state: batState,
            noticeUntil: Date.now() + 350,
            windupUntil: Date.now() + 650,
            rotation: 0,
          },
        }
        window.qa.battleRenderer.setState(state)
        window.qa.battleRenderer.render()
        const renderer = window.qa.battleRenderer.impl || window.qa.battleRenderer
        const view = renderer.monsters?.views?.get?.("bat")
        const roles = []
        view?.group?.traverse?.(node => { if (node.userData?.role) roles.push(node.userData.role) })
        return {
          label,
          mounted: Boolean(view),
          roles: [...new Set(roles)],
          noticeVisible: Boolean(view?.noticeTelegraph?.visible),
          windupVisible: Boolean(view?.windupTelegraph?.visible),
          healthFraction: view?.healthFraction ?? null,
          tier: view?.group?.userData?.tier ?? null,
          visible: Boolean(view?.group?.visible),
        }
      }, {batState, label})
      assert.equal(report.mounted, true, `${label}: bat should mount`)
      assert.ok(report.roles.includes("bat-windup-telegraph"), `${label}: windup telegraph role missing`)
      assert.ok(report.roles.includes("bat-notice-telegraph"), `${label}: notice telegraph role missing`)
      assert.equal(report.healthFraction, 1, `${label}: health badge should reflect full bat health`)
      assert.equal(report.visible, true, `${label}: bat should be visible`)
      assert.equal(report.noticeVisible, batState === "notice", `${label}: notice visibility mismatch`)
      assert.equal(report.windupVisible, batState === "windup", `${label}: windup visibility mismatch`)
      await page.screenshot({path: screenshot, fullPage: true})
      reports.push({...report, screenshot})
    }

    const despawn = await page.evaluate(() => {
      const state = window.qa.battleState
      state.monsters = {bat: {x: 520, y: 280, radius: 18, lives: 0, maxLives: 4, tier: 1, state: "patrol"}}
      window.qa.battleRenderer.setState(state)
      const renderer = window.qa.battleRenderer.impl || window.qa.battleRenderer
      return {mountedViews: renderer.monsters?.views?.size || 0}
    })
    assert.equal(despawn.mountedViews, 0, "dead bat should leave the renderer")
    assert.deepEqual(consoleErrors, [])
    assert.deepEqual(pageErrors, [])

    const result = {output, reports, despawn, consoleErrors, pageErrors}
    fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(result, null, 2))
    console.log(JSON.stringify(result, null, 2))
    await context.close()
  },
  {maxRuntimeMs: 600000},
)
