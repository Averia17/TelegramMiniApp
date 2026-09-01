const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.HERO_TRANSITION_QA_URL || "http://127.0.0.1:5173"
const output = path.resolve(__dirname, "../../output/playwright/hero-animation-transitions")
const heroes = (process.env.HERO_TRANSITION_QA_HEROES || "Mandy,Kaze,Wukong Mico,Needle,Fairy Mina,Persephone Lumi,Brock Zeus,Katty").split(",")

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    const errors = []
    const results = []
    for (const hero of heroes) {
      const page = await browser.newPage({viewport: {width: 1100, height: 900}, deviceScaleFactor: 1})
      page.on("console", message => { if (message.type() === "error") errors.push(`${hero}: ${message.text()}`) })
      page.on("pageerror", error => errors.push(`${hero}: ${error.stack || error}`))
      try {
        const heroOutput = path.join(output, hero.toLowerCase().replaceAll(" ", "-"))
        fs.mkdirSync(heroOutput, {recursive: true})
        await page.route("**/api/battle/heroes", route => route.fulfill({json: [{name: hero}]}))
        await page.route("**/api/battle/map-preview", route => route.fulfill({json: {map: {width: 1024, height: 768, tileSize: 40, walls: []}}}))
        await page.goto(`${baseUrl}/test/glb-hero-harness?hero=${encodeURIComponent(hero)}`, {waitUntil: "domcontentloaded", timeout: 30000})
        await page.waitForFunction(() => Boolean(window.qa?.getView()?.animation), {timeout: 30000})
        // The harness starts the authored spawn action automatically. Let it
        // hand control back to locomotion before measuring the next blend.
        await page.waitForTimeout(2200)
        const duration = await page.evaluate(() => {
          const controller = window.qa.getView().animation
          controller.transitionLocomotion("idle", 0)
          return controller.actions.get("attack")?.getClip().duration || 0
        })
        assert.ok(duration > 0, `${hero}: attack action missing`)
        await page.waitForTimeout(240)
        const before = await page.evaluate(() => {
          const controller = window.qa.getView().animation
          const idle = controller.actions.get("idle")
          return {idleTime: idle?.time || 0, idleDuration: idle?.getClip().duration || 2, idleWeight: idle?.getEffectiveWeight() || 0}
        })
        await page.screenshot({path: path.join(heroOutput, "before.png")})
        await page.evaluate(() => window.qa.getView().animation.playOverlay("attack", .18))
        await page.waitForTimeout(70)
        const during = await page.evaluate(() => {
          const controller = window.qa.getView().animation
          return {
            overlay: controller.overlay,
            idleTime: controller.actions.get("idle")?.time || 0,
            idleWeight: controller.actions.get("idle")?.getEffectiveWeight() || 0,
            attackWeight: controller.actions.get("attack")?.getEffectiveWeight() || 0,
          }
        })
        await page.screenshot({path: path.join(heroOutput, "during.png")})
        await page.waitForTimeout(Math.max(260, duration * 1000 + 240))
        const after = await page.evaluate(() => {
          const controller = window.qa.getView().animation
          const idle = controller.actions.get("idle")
          return {
            overlay: controller.overlay,
            state: controller.state,
            idleTime: controller.actions.get("idle")?.time || 0,
            idleDuration: idle?.getClip().duration || 2,
            idleWeight: controller.actions.get("idle")?.getEffectiveWeight() || 0,
            attackWeight: controller.actions.get("attack")?.getEffectiveWeight() || 0,
          }
        })
        await page.screenshot({path: path.join(heroOutput, "after.png")})
        assert.ok(during.overlay === "attack", `${hero}: attack overlay did not stay active during blend`)
        assert.ok(during.idleTime > before.idleTime, `${hero}: locomotion time stopped during overlay`)
        assert.ok(during.idleWeight > 0 && during.idleWeight < 1, `${hero}: locomotion was not blended during overlay`)
        assert.ok(during.attackWeight > 0, `${hero}: attack did not blend in`)
        assert.ok(after.idleWeight > .95, `${hero}: locomotion did not fade back in`)
        const idlePhaseAdvance = (after.idleTime - before.idleTime + after.idleDuration) % after.idleDuration
        assert.ok(idlePhaseAdvance > .05, `${hero}: locomotion phase was reset after overlay`)
        results.push({hero, duration, before, during, after})
      } catch (error) {
        errors.push(`${hero}: ${error.stack || error}`)
      } finally {
        await page.close()
      }
    }
    fs.mkdirSync(output, {recursive: true})
    console.log(JSON.stringify({heroes: heroes.length, results, errors, output}, null, 2))
    if (errors.length) process.exitCode = 1
  },
  {maxRuntimeMs: 180000},
).catch(error => {
  console.error(error)
  process.exitCode = 1
})
