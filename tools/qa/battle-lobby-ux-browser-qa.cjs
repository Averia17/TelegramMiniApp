const fs = require("node:fs")
const path = require("node:path")
const assert = require("node:assert/strict")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const output = path.resolve(__dirname, "../../output/playwright/battle-lobby-ux-mobile.png")
const cssPath = path.resolve(__dirname, "../../frontend/src/components/BattleGame/BattleGame.css")

const markup = `
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <main class="battle-game battle-game--mobile">
    <canvas class="battle-canvas"></canvas>
    <div class="battle-lobby-hud">
      <section class="lobby-info">
        <header class="lobby-info__header"><span class="lobby-kicker">ПОДБОР БОЯ</span><span class="lobby-live">● LIVE</span></header>
        <div class="lobby-mode-block"><span class="lobby-mode-icon">⚔</span><div><h3>БИТВА</h3><p class="lobby-mode">DEATHMATCH</p></div></div>
        <div class="lobby-status"><span class="lobby-status__signal"><i></i></span><div><strong>Ищем бойцов</strong><small>Подключаем игроков к арене</small></div></div>
        <div class="lobby-roster"></div><div class="lobby-hero-card"></div>
        <div class="lobby-meta"><button class="room-code">КОД</button><div class="lobby-timer"><span>ОЖИДАНИЕ</span><strong>···</strong></div></div>
        <button class="lobby-cancel">ОТМЕНИТЬ ПОИСК</button>
      </section>
    </div>
    <div class="mobile-stick mobile-stick-move"><span></span></div>
    <div class="mobile-stick mobile-stick-fire mobile-stick-fire--ready"><span>✦</span></div>
  </main>
`

const rect = selector => {
  const element = document.querySelector(selector)
  if (!element) return null
  const value = element.getBoundingClientRect()
  return {left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height}
}

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    fs.mkdirSync(path.dirname(output), {recursive: true})
    const context = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 1, isMobile: true, hasTouch: true})
    const page = await context.newPage()
    await page.setContent(markup)
    await page.addStyleTag({path: cssPath})
    const report = await page.evaluate(() => {
      const overlap = (first, second) => first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top
      const lobby = document.querySelector(".battle-lobby-hud")
      const card = document.querySelector(".lobby-info")
      const move = document.querySelector(".mobile-stick-move")
      const fire = document.querySelector(".mobile-stick-fire")
      const toRect = element => {
        const value = element.getBoundingClientRect()
        return {left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height}
      }
      return {
        viewport: {width: innerWidth, height: innerHeight},
        lobby: toRect(lobby),
        card: toRect(card),
        move: toRect(move),
        fire: toRect(fire),
        cardOverMove: overlap(toRect(card), toRect(move)),
        cardOverFire: overlap(toRect(card), toRect(fire)),
        backdropFilter: getComputedStyle(lobby).backdropFilter,
        pointerEvents: getComputedStyle(lobby).pointerEvents,
        rosterDisplay: getComputedStyle(document.querySelector(".lobby-roster")).display,
        heroDisplay: getComputedStyle(document.querySelector(".lobby-hero-card")).display,
      }
    })
    assert.equal(report.backdropFilter, "none")
    assert.equal(report.pointerEvents, "none")
    assert.equal(report.cardOverMove, false)
    assert.equal(report.cardOverFire, false)
    assert.equal(report.rosterDisplay, "none")
    assert.equal(report.heroDisplay, "none")
    await page.screenshot({path: output})
    console.log(JSON.stringify({output, report}, null, 2))
    await context.close()
  },
  {maxRuntimeMs: 60000},
)
