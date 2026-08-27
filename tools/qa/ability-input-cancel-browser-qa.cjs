const fs = require("node:fs")
const path = require("node:path")
const assert = require("node:assert/strict")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.ABILITY_INPUT_QA_URL || "http://127.0.0.1"
const output = path.resolve(__dirname, "../../output/playwright/ability-input-cancel")

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    const devUser = String(990000000 + (Date.now() % 100000))
    const context = await browser.newContext({viewport: {width: 375, height: 667}, deviceScaleFactor: 1, isMobile: true, hasTouch: true})
    const page = await context.newPage()
    const consoleErrors = []
    const pageErrors = []
    page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()) })
    page.on("pageerror", error => pageErrors.push(error.stack || String(error)))
    await page.addInitScript(userId => {
      localStorage.setItem(`battle_mode:${userId}`, "team")
      localStorage.setItem(`battle_hero:${userId}`, "Needle")
    }, devUser)
    await page.route("**/api/party/**", route => route.fulfill({status: 200, contentType: "application/json", body: "{}"}))
    await page.goto(`${baseUrl}/?devUser=${devUser}`, {waitUntil: "domcontentloaded", timeout: 30000})
    await page.locator(".lp-play-btn:not([disabled])").waitFor({timeout: 30000})
    await page.locator(".lp-play-btn:not([disabled])").click()
    await page.waitForFunction(() => {
      const state = window.__battleClient?.lastState
      return state?.game?.state === "game" && state?.game?.mode === "team deathmatch" && window.__battleClient?.playerId && state.players?.[window.__battleClient.playerId]
    }, {timeout: 45000})
    await page.locator(".battle-abilities").waitFor({timeout: 5000})
    // BattleGame throttles React state publication to one update per 100 ms;
    // leave a wider scheduling margin because the live gateway frame and the
    // WebGL render loop can finish on adjacent browser tasks on mobile.
    // Let the last live gateway frame leave that window before injecting the
    // deterministic cast state below; otherwise the harness can observe an
    // intentionally skipped presentation update.
    await page.waitForTimeout(500)

    const report = await page.evaluate(() => {
      const client = window.__battleClient
      const localID = client.playerId
      const sent = []
      const socket = client.ws
      socket.close()
      client.ws = {
        readyState: WebSocket.OPEN,
        send: payload => { try { sent.push(JSON.parse(payload)) } catch {} },
      }
      const castClientId = client.ability("primary")
      window.__battleSimulation.interpolationDelay = 0
      const next = structuredClone(client.lastState)
      next.ts = Number(next.ts || Date.now()) + 1
      next.game = {...next.game, state: "game", mode: "team deathmatch"}
      const local = next.players[localID]
      local.superCharge = 100
      local.channel = 800
      local.cooldowns = {...local.cooldowns, primary: 0}
      client.handleMessage({type: "state", ...next})
      window.__qaAbilityCommands = sent
      return {localID, castClientId, sent}
    })

    const castButton = page.locator("button[aria-label='Отменить текущий каст']")
    try {
      await castButton.waitFor({timeout: 5000})
    } catch (error) {
      console.log(JSON.stringify(await page.evaluate(() => ({
        local: window.__battleClient?.lastState?.players?.[window.__battleClient?.playerId],
        simulationLocal: window.__battleSimulation?.getDisplayState(Date.now(), {copyEntities: true})?.players?.[window.__battleClient?.playerId],
        reactStateLocal: window.__battleSimulation?.latestState?.players?.[window.__battleClient?.playerId],
        buttons: [...document.querySelectorAll(".battle-ability")].map(button => ({text: button.textContent, aria: button.getAttribute("aria-label"), className: button.className})),
      })), null, 2))
      throw error
    }
    assert.equal(await castButton.getAttribute("title"), "Отменить текущий каст")
    assert.ok(await castButton.evaluate(element => element.classList.contains("battle-ability--casting")))
    await castButton.click()
    const commands = await page.evaluate(() => {
      const client = window.__battleClient
      client.ability("primary", undefined, {aimProvided: true, aimAngle: 0.5, aimDistance: 240})
      return window.__qaAbilityCommands || []
    })
    const cancelCommand = commands.find(command => command.type === "ability_cancel")
    const aimedCommand = commands.find(command => command.type === "ability" && command.value?.aimProvided)
    assert.ok(report.localID, "local player id was not bound")
    assert.ok(cancelCommand?.value?.clientId, `ability_cancel was not sent: ${JSON.stringify(commands)}`)
    assert.equal(cancelCommand?.value?.targetClientId, report.castClientId)
    assert.deepEqual(aimedCommand?.value && {
      aimProvided: aimedCommand.value.aimProvided,
      aimAngle: aimedCommand.value.aimAngle,
      aimDistance: aimedCommand.value.aimDistance,
    }, {aimProvided: true, aimAngle: 0.5, aimDistance: 240})
    assert.deepEqual(consoleErrors, [], `browser console errors: ${consoleErrors.join("\n")}`)
    assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join("\n")}`)
    const result = {
      viewport: {width: 375, height: 667},
      cancelClientId: cancelCommand.value.clientId,
      cancelTargetClientId: cancelCommand.value.targetClientId,
      aimedCommand: aimedCommand.value,
      consoleErrors,
      pageErrors,
    }
    fs.mkdirSync(output, {recursive: true})
    fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(result, null, 2))
    await context.close()
    console.log(JSON.stringify(result, null, 2))
  },
  {maxRuntimeMs: 120000},
)
