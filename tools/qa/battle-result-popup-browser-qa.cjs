const fs = require("node:fs")
const path = require("node:path")
const assert = require("node:assert/strict")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.BATTLE_RESULT_QA_URL || "http://localhost:5173"
const outputDir = path.resolve(__dirname, "../../output/playwright/battle-result-popup")
const viewports = [
  {name: "desktop", width: 1280, height: 800},
  {name: "mobile", width: 375, height: 667},
]

const fixture = `
  <div class="battle-overlay battle-result-overlay battle-result-overlay--win" role="dialog" aria-modal="true" aria-labelledby="battle-result-title">
    <div class="battle-result-card battle-result-card--win">
      <div class="battle-result-card__shine"></div>
      <div class="battle-result-card__topline"><span>КОМАНДНЫЙ БОЙ</span><i></i><span class="battle-result-card__status">МАТЧ ЗАВЕРШЁН</span></div>
      <div class="battle-result-card__hero">
        <div class="battle-result-emblem">✦</div>
        <div class="battle-result-card__heading">
          <p class="battle-result-eyebrow">АРЕНА ЗА ВАМИ</p>
          <h2 id="battle-result-title">ПОБЕДА КОМАНДЫ</h2>
          <p class="battle-result-subtitle">Союзники удержали арену до конца.</p>
        </div>
      </div>
      <div class="battle-result-team-line"><span>ТВОЯ КОМАНДА ЗАБРАЛА АРЕНУ</span></div>
      <div class="battle-result-section-label">ТВОЙ ВКЛАД</div>
      <div class="battle-result-stats battle-result-stats--team">
        <div class="battle-result-stat"><i>⚔</i><span><b>4</b><small>убийства</small></span></div>
        <div class="battle-result-stat"><i>☠</i><span><b>2</b><small>смерти</small></span></div>
        <div class="battle-result-stat"><i>✹</i><span><b>740</b><small>урон бойцам</small></span></div>
        <div class="battle-result-stat"><i>▰</i><span><b>1280</b><small>урон башням</small></span></div>
        <div class="battle-result-stat"><i>⌂</i><span><b>360</b><small>урон ратуше</small></span></div>
        <div class="battle-result-stat"><i>◆</i><span><b>1</b><small>башни разрушены</small></span></div>
        <div class="battle-result-stat"><i>⌂</i><span><b>0</b><small>ратуши разрушены</small></span></div>
        <div class="battle-result-stat"><i>◷</i><span><b>2:43</b><small>время</small></span></div>
      </div>
      <button class="battle-result-button" autofocus><span>В МЕНЮ</span><kbd>ENTER</kbd></button>
    </div>
  </div>`

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    fs.mkdirSync(outputDir, {recursive: true})
    for (const viewport of viewports) {
      const page = await browser.newPage({viewport})
      const consoleErrors = []
      const pageErrors = []
      page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()) })
      page.on("pageerror", error => pageErrors.push(error.stack || String(error)))
      await page.route("**/api/**", route => route.fulfill({status: 200, contentType: "application/json", body: "{}"}))
      await page.goto(`${baseUrl}/?devUser=920000001`, {waitUntil: "domcontentloaded", timeout: 30000})
      await page.addStyleTag({path: path.resolve(__dirname, "../../frontend/src/components/BattleGame/BattleGame.css")})
      await page.evaluate(html => document.body.insertAdjacentHTML("beforeend", html), fixture)
      const report = await page.evaluate(() => {
        const card = document.querySelector(".battle-result-card")
        const button = document.querySelector(".battle-result-button")
        const rect = element => {
          const box = element.getBoundingClientRect()
          return {left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height}
        }
        return {
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: innerWidth,
          card: rect(card),
          button: rect(button),
          statCount: document.querySelectorAll(".battle-result-stat").length,
          activeElement: document.activeElement?.className || "",
        }
      })
      assert.equal(report.statCount, 8)
      assert.ok(report.documentWidth <= report.viewportWidth + 1, `${viewport.name}: result overflows horizontally`)
      assert.ok(report.card.left >= 0 && report.card.right <= viewport.width, `${viewport.name}: card escapes viewport`)
      assert.ok(report.button.left >= 0 && report.button.right <= viewport.width, `${viewport.name}: button escapes viewport`)
      assert.equal(report.activeElement, "battle-result-button")
      assert.deepEqual(consoleErrors, [])
      assert.deepEqual(pageErrors, [])
      await page.screenshot({path: path.join(outputDir, `${viewport.name}.png`), fullPage: true})
      console.log(JSON.stringify({viewport: viewport.name, report}))
      await page.close()
    }
  },
  {maxRuntimeMs: 45000},
)
