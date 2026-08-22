const fs = require("node:fs")
const path = require("node:path")
const assert = require("node:assert/strict")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.PARTY_HERO_LINEUP_QA_URL || "http://localhost:5173"
const outputDir = path.resolve(__dirname, "../../output/playwright/party-hero-lineup")
const userId = "980000001"
const heroes = [
  {name: "Kaze", displayName: "KAZE", color: "#B88CFF", rarity: "LEGENDARY", title: "NIGHT WALKER", role: "Assassin", maxLives: 700, speed: 16, attackDamage: 85, attack: {archetype: "melee_cone"}, attackDescription: "Косые удары", superDescription: "Пронзающий рывок", passiveDescription: "Исчезновение"},
  {name: "Needle", displayName: "NEEDLE", color: "#75D947", rarity: "EPIC", title: "SPORE KEEPER", role: "Controller", maxLives: 620, speed: 12, attackDamage: 65, attack: {archetype: "projectile"}, attackDescription: "Споровый шип", superDescription: "Ловчий корень", passiveDescription: "Запас влаги"},
  {name: "Mandy", displayName: "MANDY", color: "#F4C542", rarity: "MYTHIC", title: "CANDY QUEEN", role: "Fighter", maxLives: 720, speed: 15, attackDamage: 105, attack: {archetype: "melee_cone"}, attackDescription: "Удар посохом", superDescription: "Волна опустошения", passiveDescription: "Нерушимая стойка"},
]
const party = {partyId: "party-qa", maxSize: 3, revision: 4, members: [
  {playerId: "980000002", name: "NeedleFanWithAReallyLongNickname", hero: "Needle"},
  {playerId: userId, name: "Sulteе", hero: "Kaze", owner: true},
  {playerId: "980000003", name: "MandyMain", hero: "Mandy"},
]}

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    fs.mkdirSync(outputDir, {recursive: true})
    const context = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1})
    const page = await context.newPage()
    const consoleErrors = []
    const pageErrors = []
    page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()) })
    page.on("pageerror", error => pageErrors.push(error.stack || String(error)))
    await page.addInitScript(() => {
      window.WebSocket = class FakeWebSocket {
        constructor() {
          this.readyState = 1
          this.listeners = new Map()
          queueMicrotask(() => this.dispatch("open", {}))
        }
        addEventListener(type, listener) {
          const listeners = this.listeners.get(type) || []
          listeners.push(listener)
          this.listeners.set(type, listeners)
        }
        removeEventListener(type, listener) {
          this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item !== listener))
        }
        dispatch(type, event) {
          this.listeners.get(type)?.forEach(listener => listener(event))
          this[`on${type}`]?.(event)
        }
        send() {}
        close() { this.readyState = 3; this.dispatch("close", {}) }
      }
    })
    await page.route("**/api/**", route => route.fulfill({json: {}}))
    await page.route("**/api/accounts/auth/telegram", route => route.fulfill({json: {access_token: "qa", user_id: Number(userId)}}))
    await page.route("**/api/accounts/economy/me", route => route.fulfill({json: {energy: 100, max_energy: 100, gold: 50, crystals: 20, taunt_charges: 0, next_energy_in: 0}}))
    await page.route("**/api/battle/heroes", route => route.fulfill({json: heroes}))
    await page.route("**/api/party/mine", route => route.fulfill({json: party}))
    await page.route("**/api/party/invites/pending", route => route.fulfill({json: []}))
    await page.route("**/api/party/invites/outgoing", route => route.fulfill({json: [{inviteId: "invite-qa", status: "pending", toId: "980000004", toName: "WaitingFriend"}]}))
    await page.goto(`${baseUrl}/?devUser=${userId}`, {waitUntil: "domcontentloaded", timeout: 30000})
    await page.locator(".hero-party-lineup").waitFor({timeout: 30000})
    await page.waitForTimeout(800)

    const desktop = await page.evaluate(() => {
      const getRects = () => [...document.querySelectorAll(".hero-party-member")].map(element => {
        const rect = element.getBoundingClientRect()
        return {left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height}
      })
      return {
      names: [...document.querySelectorAll(".hero-party-name")].map(node => node.textContent),
      canvases: document.querySelectorAll(".hero-party-member canvas").length,
      lineupClass: document.querySelector(".hero-party-lineup")?.className,
      rects: getRects(),
      memberCenters: getRects().map(rect => (rect.left + rect.right) / 2),
      portraitHeights: [...document.querySelectorAll(".hero-party-member .hero-portrait")].map(element => element.getBoundingClientRect().height),
      canvasSizes: [...document.querySelectorAll(".hero-party-member canvas")].map(canvas => [canvas.width, canvas.height]),
      nameStyle: (() => {
        const style = getComputedStyle(document.querySelector(".hero-party-name"))
        return {backgroundColor: style.backgroundColor, borderWidth: style.borderTopWidth, boxShadow: style.boxShadow}
      })(),
      pendingInvite: Boolean(document.querySelector(".party-roster-widget__invite.is-pending")),
      partyWidgetStartButton: Boolean(document.querySelector(".party-roster-widget__start")),
      mainStartButton: Boolean(document.querySelector(".lp-play-btn")),
      partyLeaveLabel: document.querySelector(".party-roster-widget__header button")?.textContent,
      desktopKickButtons: document.querySelectorAll(".party-roster-widget__kick--desktop").length,
      partyRosterLayout: (() => {
        const widget = document.querySelector(".party-roster-widget")
        const members = document.querySelector(".party-roster-widget__members")
        const headerInfo = document.querySelector(".party-roster-widget__header div")
        const leaveButton = document.querySelector(".party-roster-widget__header button")
        return {
          width: widget?.getBoundingClientRect().width,
          membersDisplay: getComputedStyle(members).display,
          membersDirection: getComputedStyle(members).flexDirection,
          headerInfoDisplay: getComputedStyle(headerInfo).display,
          leaveButtonLabel: getComputedStyle(leaveButton, "::after").content,
        }
      })(),
      documentWidth: document.documentElement.scrollWidth,
      }
    })
    assert.deepEqual(desktop.names, ["NeedleFanWithAReallyLongNickname", "ТЫ", "MandyMain"])
    assert.equal(desktop.canvases, 3)
    assert.match(desktop.lineupClass, /hero-party-lineup--3/)
    assert.deepEqual(desktop.canvasSizes, [[300, 340], [300, 340], [300, 340]])
    assert.ok(desktop.memberCenters[1] - desktop.memberCenters[0] < 260, `left hero is too far from center: ${desktop.memberCenters}`)
    assert.ok(desktop.memberCenters[2] - desktop.memberCenters[1] < 260, `right hero is too far from center: ${desktop.memberCenters}`)
    assert.ok(desktop.portraitHeights[1] > 250, `center portrait is too small: ${desktop.portraitHeights[1]}px`)
    assert.equal(desktop.nameStyle.backgroundColor, "rgba(0, 0, 0, 0)")
    assert.equal(desktop.nameStyle.borderWidth, "0px")
    assert.equal(desktop.nameStyle.boxShadow, "none")
    assert.equal(desktop.pendingInvite, true)
    assert.equal(desktop.partyWidgetStartButton, false)
    assert.equal(desktop.mainStartButton, true)
    assert.equal(desktop.partyLeaveLabel, "ПОКИНУТЬ ПАТИ")
    assert.equal(desktop.desktopKickButtons, 2)
    assert.equal(desktop.partyRosterLayout.width, 240)
    assert.equal(desktop.partyRosterLayout.membersDisplay, "flex")
    assert.equal(desktop.partyRosterLayout.membersDirection, "column")
    assert.equal(desktop.partyRosterLayout.headerInfoDisplay, "none")
    assert.equal(desktop.partyRosterLayout.leaveButtonLabel, '"ВЫЙТИ"')
    assert.ok(desktop.documentWidth <= 1440)

    await page.locator(".lp-team-button").click()
    await page.locator(".party-panel").waitFor({timeout: 5000})
    const panelText = await page.locator(".party-panel").innerText()
    assert.equal(panelText.includes("Герои пати уникальны"), false)
    assert.equal(await page.locator(".party-panel .party-create").count(), 0)
    assert.equal(await page.locator(".party-panel .party-leave").count(), 1)
    assert.equal(await page.locator(".party-member__actions button").count(), 2)
    await page.locator(".party-panel__close").click()

    await page.screenshot({path: path.join(outputDir, "desktop.png"), fullPage: true})
    await page.setViewportSize({width: 390, height: 844})
    await page.waitForTimeout(300)
    const mobile = await page.evaluate(() => {
      const rects = [...document.querySelectorAll(".hero-party-member")].map(element => {
        const rect = element.getBoundingClientRect()
        return {left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height}
      })
      return {rects, documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth}
    })
    assert.ok(mobile.documentWidth <= mobile.viewportWidth + 1)
    assert.equal(mobile.rects.length, 3)
    assert.ok(mobile.rects.every(rect => rect.width > 0 && rect.height > 0))
    const longNameButton = page.locator(".party-roster-widget__name").first()
    const compactBeforeTap = await page.evaluate(() => ({
      widgetWidth: document.querySelector(".party-roster-widget")?.getBoundingClientRect().width,
      heroRects: [...document.querySelectorAll(".hero-party-member")].map(element => {
        const rect = element.getBoundingClientRect()
        return [rect.left, rect.top, rect.width, rect.height]
      }),
      nameOverflow: (() => {
        const name = document.querySelector(".party-roster-widget__name")
        return name.scrollWidth > name.clientWidth
      })(),
    }))
    await longNameButton.click()
    const expandedName = await page.evaluate(() => {
      const name = document.querySelector(".party-roster-widget__name")
      const member = name?.closest(".party-roster-widget__member")
      const widget = document.querySelector(".party-roster-widget")
      return {
        fullName: name?.textContent,
        expanded: name?.getAttribute("aria-expanded"),
        overlayVisible: getComputedStyle(member, "::after").display === "block",
        widgetWidth: widget?.getBoundingClientRect().width,
        heroRects: [...document.querySelectorAll(".hero-party-member")].map(element => {
          const rect = element.getBoundingClientRect()
          return [rect.left, rect.top, rect.width, rect.height]
        }),
      }
    })
    assert.equal(compactBeforeTap.nameOverflow, true)
    assert.equal(expandedName.fullName, "NeedleFanWithAReallyLongNickname")
    assert.equal(expandedName.expanded, "true")
    assert.equal(expandedName.overlayVisible, true)
    assert.equal(expandedName.widgetWidth, compactBeforeTap.widgetWidth)
    assert.deepEqual(expandedName.heroRects, compactBeforeTap.heroRects)
    await page.screenshot({path: path.join(outputDir, "mobile-long-name.png"), fullPage: true})
    await longNameButton.click()
    assert.equal(await longNameButton.getAttribute("aria-expanded"), "false")
    await longNameButton.click()
    await page.mouse.click(180, 500)
    assert.equal(await longNameButton.getAttribute("aria-expanded"), "false")
    const mobileFriend = page.locator(".party-roster-widget__member").filter({hasText: "NeedleFanWithAReallyLongNickname"})
    await mobileFriend.dispatchEvent("pointerdown", {pointerId: 1, pointerType: "touch", isPrimary: true, buttons: 1})
    await page.waitForTimeout(650)
    assert.equal(await page.locator(".party-roster-widget__member.is-kick-target").count(), 1)
    assert.equal(await page.locator(".party-roster-widget__kick--mobile:visible").count(), 1)
    await mobileFriend.dispatchEvent("pointerup", {pointerId: 1, pointerType: "touch", isPrimary: true, buttons: 0})
    assert.deepEqual(consoleErrors, [])
    assert.deepEqual(pageErrors, [])
    await page.screenshot({path: path.join(outputDir, "mobile.png"), fullPage: true})
    await context.close()
    console.log(JSON.stringify({outputDir, desktop, mobile, mobileKickRevealed: true}, null, 2))
  },
  {maxRuntimeMs: 90000},
)
