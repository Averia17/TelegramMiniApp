const assert = require("node:assert/strict")
const path = require("node:path")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.BATTLE_HISTORY_QA_URL || "http://localhost:5173"
const desktopOutput = path.resolve(__dirname, "../../output/playwright/battle-history-desktop.png")
const mobileOutput = path.resolve(__dirname, "../../output/playwright/battle-history-mobile.png")
const profileOutput = path.resolve(__dirname, "../../output/playwright/battle-history-profile.png")
const profileMobileOutput = path.resolve(__dirname, "../../output/playwright/battle-history-profile-mobile.png")

const history = [
  {
    id: "battle-3",
    won: true,
    mode: "team deathmatch",
    mapName: "team-battle",
    finishedAt: "2026-08-22T14:42:00.000Z",
    duration: 148,
    place: 1,
    kills: 7,
    deaths: 1,
    partyMembers: [{name: "Луна"}, {name: "Кай"}],
  },
  {
    id: "battle-2",
    won: false,
    mode: "deathmatch",
    mapName: "battle-royale",
    finishedAt: "2026-08-21T18:20:00.000Z",
    duration: 91,
    place: 4,
    kills: 2,
    deaths: 1,
  },
  {
    id: "battle-1",
    won: true,
    mode: "deathmatch",
    mapName: "arena",
    finishedAt: "2026-08-20T10:12:00.000Z",
    duration: 205,
    place: 1,
    kills: 5,
    deaths: 0,
  },
]
for (let index = 4; index <= 20; index += 1) {
  const podiumPlace = index === 10 ? 1 : index === 12 ? 2 : index === 13 ? 3 : 4
  history.push({
    id: `battle-${index}`,
    won: podiumPlace === 1,
    draw: index === 11,
    mode: [10, 12, 13].includes(index) ? "deathmatch" : index % 2 ? "deathmatch" : "team deathmatch",
    mapName: index % 2 ? "battle-royale" : "team-battle",
    finishedAt: `2026-08-${String(Math.max(1, 22 - index)).padStart(2, "0")}T10:12:00.000Z`,
    duration: 80 + index,
    place: podiumPlace,
    kills: index % 6,
    deaths: index % 3,
  })
}
const activeBattle = {roomId: "active-room-7", mode: "team deathmatch", mapName: "team-battle", partyId: "party-qa"}

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    const page = await browser.newPage({viewport: {width: 1280, height: 900}})
    const consoleErrors = []
    const pageErrors = []
    let historyRequests = 0
    page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()) })
    page.on("pageerror", error => pageErrors.push(error.stack || String(error)))

    await page.route("**/api/**", async route => {
      const pathname = new URL(route.request().url()).pathname
      if (pathname.endsWith("/auth/telegram")) return route.fulfill({json: {access_token: "qa", user_id: 920000001}})
      if (pathname.endsWith("/users/me/profile")) return route.fulfill({json: {nickname: "Riko", username: "riko", full_name: "Riko"}})
      if (pathname.includes("/leaderboard/profile/")) return route.fulfill({json: {score: 1240, rank: 84, games: 18, wins: 11, kills: 46}})
      if (pathname.endsWith("/economy/me")) return route.fulfill({json: {energy: 100, max_energy: 100, gold: 80, crystals: 20, taunt_charges: 0}})
      if (pathname.endsWith("/battle/history")) {
        historyRequests += 1
        const hasCursor = new URL(route.request().url()).searchParams.has("cursor")
        return route.fulfill({json: hasCursor
          ? {items: history.slice(2), hasMore: false}
          : {items: history.slice(0, 2), nextCursor: "qa-cursor-2", hasMore: true}})
      }
      return route.fulfill({json: {}})
    })
    await page.addInitScript(({active}) => {
      window.localStorage.setItem("battle_history:920000001", JSON.stringify([]))
      window.localStorage.setItem("battle_active:920000001", JSON.stringify(active))
    }, {active: activeBattle})
    await page.goto(`${baseUrl}/?devUser=920000001`, {waitUntil: "domcontentloaded"})
    await page.locator(".lp-profile-chip").waitFor()
    await page.locator(".lp-profile-chip").click()
    await page.locator("[data-testid='latest-battle']").waitFor()
    const activeLink = page.locator("[data-testid='active-battle'] a")
    await activeLink.waitFor()
    assert.equal(await activeLink.getAttribute("href"), "/battle/active-room-7?mode=team&party=party-qa&map=team-battle")

    const profileText = await page.locator(".bs-profile").innerText()
    assert.match(profileText, /Победа/)
    assert.match(profileText, /Каменный Перекрёсток/)
    assert.match(profileText, /Луна · Кай/)
    await page.screenshot({path: profileOutput, fullPage: true})

    await page.setViewportSize({width: 390, height: 844})
    const mobileProfile = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      profileWidth: document.querySelector(".bs-profile")?.getBoundingClientRect().width || 0,
      viewportWidth: innerWidth,
    }))
    assert.ok(mobileProfile.documentWidth <= mobileProfile.viewportWidth + 1, "profile overflows horizontally on mobile")
    assert.ok(mobileProfile.profileWidth <= mobileProfile.viewportWidth + 1, "profile is wider than mobile viewport")
    await page.screenshot({path: profileMobileOutput, fullPage: true})

    await page.setViewportSize({width: 1280, height: 900})
    await page.getByRole("button", {name: /Все бои/}).click()
    const dialog = page.getByRole("dialog", {name: /Все бои/})
    await dialog.waitFor()
    await page.locator(".bs-battle-modal__list").evaluate(element => { element.scrollTop = element.scrollHeight })
    await page.waitForFunction(() => document.querySelectorAll(".bs-battle-modal__list .bs-battle-card").length === 20)
    const listMetrics = await page.locator(".bs-battle-modal__list").evaluate(element => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      cardHeights: [...element.querySelectorAll(".bs-battle-card")].map(card => card.getBoundingClientRect().height),
    }))
    assert.equal(await dialog.locator(".bs-battle-card").count(), 20)
    assert.ok(await dialog.locator(".bs-battle-card--placement.bs-battle-card--gold").count() >= 2, "solo top 1 should use the gold podium tone")
    assert.ok(await dialog.locator(".bs-battle-card--placement.bs-battle-card--silver").count() >= 1, "solo top 2 should use the silver podium tone")
    assert.ok(await dialog.locator(".bs-battle-card--placement.bs-battle-card--bronze").count() >= 1, "solo top 3 should use the bronze podium tone")
    assert.ok(await dialog.locator(".bs-battle-card--placement.bs-battle-card--neutral").count() >= 1, "solo places after top 3 should stay neutral")
    assert.equal(await dialog.locator(".bs-battle-card--placement .bs-battle-card__place").count(), 0, "solo placement should have one place label")
    assert.ok((await dialog.locator(".bs-battle-card--placement .bs-battle-card__result strong").allTextContents()).some(text => /место/.test(text)), "solo placement label should be visible")
    assert.ok(listMetrics.scrollHeight > listMetrics.clientHeight, "history list should scroll with 20 battles")
    assert.ok(Math.min(...listMetrics.cardHeights) > 140, "battle cards should not collapse inside the scroll list")
    assert.equal(historyRequests, 2)
    await page.screenshot({path: desktopOutput, fullPage: true})

    await page.setViewportSize({width: 390, height: 844})
    await page.locator(".bs-battle-modal__list").evaluate(element => { element.scrollTop = 0 })
    const mobileListMetrics = await page.locator(".bs-battle-modal__list").evaluate(element => ({
      cardHeights: [...element.querySelectorAll(".bs-battle-card")].map(card => card.getBoundingClientRect().height),
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }))
    assert.ok(Math.max(...mobileListMetrics.cardHeights) <= 135, `mobile battle cards should use the compact archive density (max ${Math.max(...mobileListMetrics.cardHeights)}px)`)
    assert.ok(mobileListMetrics.scrollHeight > mobileListMetrics.clientHeight, "mobile history should remain scrollable")
    await page.screenshot({path: mobileOutput, fullPage: true})
    await page.getByRole("button", {name: "Закрыть историю боёв"}).click()
    assert.equal(await page.locator(".bs-battle-modal").count(), 0)
    assert.deepEqual(consoleErrors, [])
    assert.deepEqual(pageErrors, [])
  },
)
