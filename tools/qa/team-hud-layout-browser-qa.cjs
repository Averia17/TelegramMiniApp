const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const outputDir = path.resolve(__dirname, "../../output/playwright/team-hud-layout")
const battleCss = fs.readFileSync(path.resolve(__dirname, "../../frontend/src/components/BattleGame/BattleGame.css"), "utf8")
const viewports = [
  {name: "iphone-se", width: 375, height: 667},
  {name: "iphone-14", width: 390, height: 844},
  {name: "pixel-7", width: 412, height: 915},
  {name: "android-wide", width: 430, height: 932},
  {name: "desktop", width: 1280, height: 900},
]

const sampleTeam = (name, tone) => `
  <div class="team-battle-hud__team ${tone}">
    <div class="team-battle-hud__header">
      <strong><i class="team-battle-hud__swatch"></i>${name}</strong>
      <span class="team-battle-hud__kills"><b>3</b></span>
    </div>
    <div class="team-battle-hud__members">
      <span class="team-battle-hud__member"><span class="team-battle-hud__avatar">A</span></span>
      <span class="team-battle-hud__member"><span class="team-battle-hud__avatar">B</span></span>
      <span class="team-battle-hud__member"><span class="team-battle-hud__avatar">C</span></span>
    </div>
    <div class="team-battle-hud__objectives">
      <div class="team-battle-hud__objective"><span class="team-battle-hud__objective-icon">▰</span><span class="team-battle-hud__objective-label">БАШНИ</span><i><em style="width:85%"></em></i><b>85%</b></div>
      <div class="team-battle-hud__objective"><span class="team-battle-hud__objective-icon">◆</span><span class="team-battle-hud__objective-label">РАТУША</span><i><em style="width:75%"></em></i><b>75%</b></div>
    </div>
  </div>`

const fixture = `<!doctype html><html><head><meta charset="utf-8"><style>
  html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #18234b; }
  .fixture-player { position: absolute; top: var(--team-info-top); left: var(--battle-safe-left); width: 120px; height: 48px; border-radius: 10px; background: #2d4b9c; }
  .fixture-minimap { position: absolute; top: var(--team-info-top); right: var(--battle-safe-right); width: 90px; height: 90px; border-radius: 50%; background: #4f78ae; }
</style><style>${battleCss}</style></head><body>
  <main class="battle-game battle-game--team">
    <header class="battle-topbar"><button class="battle-exit-btn">×</button></header>
    <section class="team-battle-hud" aria-label="Состав и счёт команд">
      ${sampleTeam("СОЮЗНИКИ", "is-local")}
      <div class="team-battle-hud__timer"><div class="battle-match-timer"><span>ВРЕМЯ БОЯ</span><strong>4:45</strong></div></div>
      ${sampleTeam("ПРОТИВНИКИ", "is-enemy")}
    </section>
    <div class="fixture-player"></div><div class="fixture-minimap"></div>
  </main>
</body></html>`

const rect = element => {
  if (!element) return null
  const value = element.getBoundingClientRect()
  return {left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height}
}

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    fs.mkdirSync(outputDir, {recursive: true})
    const reports = []
    for (const viewport of viewports) {
      const page = await browser.newPage({viewport, deviceScaleFactor: 1})
      await page.setContent(fixture, {waitUntil: "load"})
      const report = await page.evaluate(() => {
        const score = document.querySelector(".team-battle-hud")
        const timer = document.querySelector(".team-battle-hud__timer")
        const objectives = document.querySelector(".team-battle-hud__objectives")
        const player = document.querySelector(".fixture-player")
        const scoreRect = score.getBoundingClientRect()
        const timerRect = timer.getBoundingClientRect()
        const objectiveRect = objectives.getBoundingClientRect()
        const playerRect = player.getBoundingClientRect()
        const teamRects = [...document.querySelectorAll(".team-battle-hud__team")].map(team => {
          const teamRect = team.getBoundingClientRect()
          const members = team.querySelector(".team-battle-hud__members")
          const membersRect = members.getBoundingClientRect()
          return {team: {left: teamRect.left, right: teamRect.right}, membersBox: {left: membersRect.left, right: membersRect.right, width: membersRect.width, justify: getComputedStyle(members).justifyContent}, members: [...team.querySelectorAll(".team-battle-hud__member")].map(member => {
            const memberRect = member.getBoundingClientRect()
            return {left: memberRect.left, right: memberRect.right, top: memberRect.top, bottom: memberRect.bottom, inside: memberRect.left >= teamRect.left && memberRect.right <= teamRect.right && memberRect.top >= teamRect.top && memberRect.bottom <= teamRect.bottom}
          })}
        })
        return {
          documentWidth: document.documentElement.scrollWidth,
          score: {height: scoreRect.height, width: scoreRect.width},
          timerInside: timerRect.top >= scoreRect.top && timerRect.bottom <= scoreRect.bottom,
          objectivesInside: objectiveRect.top >= scoreRect.top && objectiveRect.bottom <= scoreRect.bottom,
          teamMembersInside: teamRects.every(team => team.members.every(member => member.inside)),
          scoreToPlayer: playerRect.top - scoreRect.bottom,
        }
      })
      assert.ok(report.documentWidth <= viewport.width + 1, `${viewport.name}: HUD overflows horizontally`)
      assert.equal(report.timerInside, true, `${viewport.name}: timer escaped the combined HUD`)
      assert.equal(report.objectivesInside, true, `${viewport.name}: objectives escaped the combined HUD`)
      assert.equal(report.teamMembersInside, true, `${viewport.name}: a team avatar escaped its team panel`)
      assert.ok(report.scoreToPlayer >= 8, `${viewport.name}: HUD/player gap is ${report.scoreToPlayer}px`)
      assert.ok(report.score.height <= 100, `${viewport.name}: HUD is too tall (${report.score.height}px)`)
      await page.screenshot({path: path.join(outputDir, `${viewport.name}.png`), fullPage: true})
      reports.push({viewport, report})
      await page.close()
    }
    console.log(JSON.stringify({outputDir, reports}, null, 2))
  },
).catch(error => {
  console.error(error)
  process.exitCode = 1
})
