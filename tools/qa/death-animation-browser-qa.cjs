const fs = require("node:fs")
const path = require("node:path")
const {chromium} = require("playwright")
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.DEATH_ANIMATION_QA_URL || "http://127.0.0.1:5173"
const output = path.resolve(__dirname, "../../output/playwright/death-animation")
fs.mkdirSync(output, {recursive: true})

const slug = name => name.toLowerCase().replaceAll(" ", "-")

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    const pageErrors = []
    const consoleErrors = []

    const results = []
    const heroes = (process.env.DEATH_ANIMATION_QA_HEROES || "Needle,Katty").split(",")
    for (const hero of heroes) {
      const page = await browser.newPage({viewport: {width: 960, height: 720}, deviceScaleFactor: 1})
      page.on("pageerror", error => pageErrors.push(`${hero}: ${error.message}`))
      page.on("console", message => {
        if (message.type() === "error") consoleErrors.push(`${hero}: ${message.text()}`)
      })
      await page.route("**/api/battle/heroes", route => route.fulfill({json: [{name: hero}]}))
      await page.route("**/api/battle/map-preview", route => route.fulfill({json: {
        map: {width: 1024, height: 768, tileSize: 40, walls: []},
      }}))
      await page.goto(`${baseUrl}/test/glb-hero-harness?hero=${encodeURIComponent(hero)}`, {waitUntil: "domcontentloaded"})
      await page.waitForFunction(() => document.querySelector("#status")?.classList.contains("ready"), {timeout: 30_000})
      await page.waitForTimeout(500)
      await page.evaluate(() => {
        const select = document.querySelector("#hero-select")
        if (select) select.replaceWith(select.cloneNode(true))
        window.qa.player.x = 350
        window.qa.player.y = 260
        window.qa.battleRenderer.cameraRig.preferredVertical = 14
        window.qa.battleRenderer.setState(window.qa.battleState)
      })
      await page.waitForTimeout(300)
      await page.evaluate(() => {
        window.qa.player.lives = 0
        window.qa.battleRenderer.setState(window.qa.battleState)
      })
      await page.waitForTimeout(180)
      const impact = await page.evaluate(() => {
        const view = window.qa.getView()
        return {
          controllerState: view?.animation?.state,
          burstVisible: view?.deathBurst?.visible,
          ringOpacity: view?.deathBurst?.children?.find(child => child.userData.deathRole === "ring")?.material?.opacity,
          modelOpacity: view?.modelOpacity,
        }
      })
      await page.screenshot({path: path.join(output, `${slug(hero)}-impact.png`)})
      await page.waitForTimeout(850)
      const followThrough = await page.evaluate(() => ({
        mounted: Boolean(window.qa.getView()),
        modelOpacity: window.qa.getView()?.modelOpacity,
      }))
      await page.screenshot({path: path.join(output, `${slug(hero)}-follow-through.png`)})
      await page.waitForTimeout(1400)
      const completion = await page.evaluate(() => {
        const view = window.qa.getView()
        return {
          removed: !view,
          deathTime: view?.deathTime,
          deathElapsed: view?.deathElapsed,
          controllerDeathElapsed: view?.animation?.deathElapsed,
          controllerDeathProgress: view?.animation?.getDeathProgress?.(),
          complete: view?.isDeathAnimationComplete?.(),
        }
      })
      results.push({hero, impact, followThrough, completion})
      await page.close()
    }

    if (pageErrors.length || consoleErrors.length) {
      throw new Error(JSON.stringify({pageErrors, consoleErrors}, null, 2))
    }
    for (const result of results) {
      if (result.impact.controllerState !== "dead" || !result.impact.burstVisible || !(result.impact.ringOpacity > 0)) {
        throw new Error(`${result.hero}: death impact was not visible: ${JSON.stringify(result)}`)
      }
      if (!result.followThrough.mounted || !result.completion.removed) {
        throw new Error(`${result.hero}: invalid death lifecycle: ${JSON.stringify(result)}`)
      }
    }
    console.log(JSON.stringify({results, pageErrors, consoleErrors, output}, null, 2))
  },
  {maxRuntimeMs: 120_000},
).catch(error => {
  console.error(error)
  process.exitCode = 1
})
