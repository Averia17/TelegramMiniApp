const fs = require("fs")
const path = require("path")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))

const ROOT = path.resolve(__dirname, "../..")
const HARNESS = process.env.HARNESS_URL || "http://127.0.0.1:5173/test/glb-hero-harness.html"
const OUT = path.join(ROOT, "output", "playwright", "kaze-animation-qa")
const cases = [
  ["idle", '[data-animation="idle"]', "idle", state => state.actionWeights.idle >= .5],
  ["run", '[data-animation="run"]', "run", state => state.actionWeights.run >= .5],
  ["attack", '[data-skill="attack"]', "Attack", state => state.overlay === "attack" && state.actionWeights.attack >= .5],
  ["super", '[data-skill="super"]', "super", state => state.overlay === "super" && state.actionWeights.super >= .5],
  ["aim", '[data-animation="aim"]', "Aim", state => state.actionWeights.aim >= .3],
  ["aim-super", '[data-animation="aimSuper"]', "AimSuper", state => state.actionWeights.aimSuper >= .5],
  ["hit", '[data-animation="hit"]', "hit", state => state.overlay === "hit" && state.actionWeights.hit >= .5],
  ["death", '[data-animation="defeat"]', "death", state => state.animation === "defeat" && state.actionWeights.defeat >= .5],
  ["spawn", '[data-animation="spawn"]', "Spawn", state => state.animation === "spawn" && state.actionWeights.spawn >= .5],
  ["victory", '[data-animation="victory"]', "Victory", state => state.animation === "victory" && state.actionWeights.victory >= .5],
  ["gadget", '[data-skill="gadget"]', "Gadget", state => state.overlay === "gadget" && state.actionWeights.gadget >= .5],
  ["aim-gadget", '[data-animation="aimGadget"]', "AimGadget", state => state.overlay === "aimGadget" && state.actionWeights.aimGadget >= .5],
]

fs.mkdirSync(OUT, {recursive: true});

(async () => {
  const browser = await chromium.launch({headless: true, args: ["--disable-gpu"]})
  const page = await browser.newPage({viewport: {width: 1280, height: 720}, deviceScaleFactor: 1})
  const consoleErrors = []
  const pageErrors = []
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()) })
  page.on("pageerror", error => pageErrors.push(String(error)))
  await page.route("**/api/battle/heroes", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify([{name: "Kaze"}]),
  }))
  await page.goto(`${HARNESS}?hero=Kaze`, {waitUntil: "domcontentloaded", timeout: 15000})
  await page.waitForFunction(() => window.qa && window.qa.clips?.length > 0, {timeout: 15000})
  const clips = await page.evaluate(() => window.qa.clips.slice())
  const results = []
  for (const [name, selector, expectedClip, predicate] of cases) {
    await page.locator(selector).click()
    await page.waitForTimeout(name === "hit" ? 45 : name === "spawn" ? 120 : 180)
    const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()))
    const valid = clips.includes(expectedClip) && predicate(state) && state.fallbackEvents.length === 0
    results.push({name, expectedClip, valid, animation: state.animation, overlay: state.overlay, actionWeights: state.actionWeights, fallbackEvents: state.fallbackEvents})
    if (name === "attack" || name === "aim-gadget") await page.screenshot({path: path.join(OUT, `${name}.png`), fullPage: true})
  }
  const report = {hero: "Kaze", clips, cases: results, consoleErrors, pageErrors, status: results.every(item => item.valid) && !consoleErrors.length && !pageErrors.length ? "PASS" : "FAIL"}
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({status: report.status, clips, cases: results.length, invalid: results.filter(item => !item.valid).length, consoleErrors: consoleErrors.length, pageErrors: pageErrors.length, report: path.join(OUT, "report.json")}))
  await browser.close()
  if (report.status !== "PASS") process.exitCode = 1
})().catch(error => {
  console.error(error)
  process.exitCode = 1
})
