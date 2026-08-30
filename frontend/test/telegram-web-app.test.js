import test from "node:test"
import assert from "node:assert/strict"
import {
  enterTelegramBattleMode,
  isTelegramVersionAtLeast,
  leaveTelegramBattleMode,
  setupTelegramBackButton,
  setupTelegramActivity,
  setupTelegramWebApp,
  triggerTelegramHaptic,
} from "../src/utils/telegramWebApp.js"

const createDocument = () => {
  const values = new Map()
  return {
    documentElement: {
      style: {
        setProperty(name, value) {
          values.set(name, value)
        },
      },
    },
    values,
  }
}

test("Telegram version checks use the native capability check when available", () => {
  const webApp = {
    isVersionAtLeast(version) {
      return version === "8.0"
    },
  }

  assert.equal(isTelegramVersionAtLeast(webApp, "8.0"), true)
  assert.equal(isTelegramVersionAtLeast(webApp, "9.0"), false)
})

test("Telegram setup mirrors safe areas and stable viewport height into CSS", () => {
  const document = createDocument()
  const handlers = new Map()
  const webApp = {
    version: "9.0",
    safeAreaInset: {top: 4, right: 2, bottom: 9, left: 1},
    contentSafeAreaInset: {top: 8, right: 3, bottom: 12, left: 5},
    viewportHeight: 700,
    viewportStableHeight: 680,
    onEvent(name, handler) {
      handlers.set(name, handler)
    },
    offEvent(name, handler) {
      assert.equal(handlers.get(name), handler)
      handlers.delete(name)
    },
  }

  const cleanup = setupTelegramWebApp({Telegram: {WebApp: webApp}, document})

  assert.equal(document.values.get("--telegram-safe-area-inset-top"), "4px")
  assert.equal(document.values.get("--telegram-content-safe-area-inset-top"), "8px")
  assert.equal(document.values.get("--telegram-safe-top"), "8px")
  assert.equal(document.values.get("--telegram-safe-bottom"), "12px")
  assert.equal(document.values.get("--telegram-viewport-height"), "680px")
  assert.equal(handlers.has("safeAreaChanged"), true)
  assert.equal(handlers.has("contentSafeAreaChanged"), true)
  assert.equal(handlers.has("viewportChanged"), true)

  cleanup()

  assert.equal(handlers.size, 0)
})

test("Telegram activity follows isActive and cleans up activated/deactivated handlers", () => {
  const handlers = new Map()
  const activity = []
  const webApp = {
    isActive: false,
    onEvent(name, handler) {
      handlers.set(name, handler)
    },
    offEvent(name, handler) {
      assert.equal(handlers.get(name), handler)
      handlers.delete(name)
    },
  }

  const cleanup = setupTelegramActivity({Telegram: {WebApp: webApp}}, active => activity.push(active))

  assert.deepEqual(activity, [false])
  handlers.get("activated")()
  handlers.get("deactivated")()
  assert.deepEqual(activity, [false, true, false])

  cleanup()
  assert.equal(handlers.size, 0)
})

test("Telegram BackButton is shown for a route and hidden during cleanup", () => {
  const calls = []
  const backButton = {
    show: () => calls.push("show"),
    hide: () => calls.push("hide"),
    onClick: handler => {
      calls.push("onClick")
      backButton.handler = handler
    },
    offClick: handler => {
      assert.equal(backButton.handler, handler)
      calls.push("offClick")
    },
  }
  let navigations = 0
  const cleanup = setupTelegramBackButton({Telegram: {WebApp: {BackButton: backButton}}}, () => { navigations += 1 })

  backButton.handler()
  cleanup()

  assert.equal(navigations, 1)
  assert.deepEqual(calls, ["show", "onClick", "hide", "offClick"])
})

test("Telegram haptics call the supported feedback channel and no-op elsewhere", () => {
  const calls = []
  const platform = {Telegram: {WebApp: {HapticFeedback: {
    impactOccurred: style => calls.push(["impact", style]),
    notificationOccurred: type => calls.push(["notification", type]),
    selectionChanged: () => calls.push(["selection"]),
  }}}}

  assert.equal(triggerTelegramHaptic(platform, "impact", "light"), true)
  assert.equal(triggerTelegramHaptic(platform, "notification", "success"), true)
  assert.equal(triggerTelegramHaptic(platform, "selection"), true)
  assert.equal(triggerTelegramHaptic({}, "impact", "light"), false)
  assert.deepEqual(calls, [["impact", "light"], ["notification", "success"], ["selection"]])
})

test("battle mode opts into fullscreen and prevents accidental vertical swipe dismissal", () => {
  const calls = []
  const webApp = {
    version: "8.0",
    expand: () => calls.push("expand"),
    requestFullscreen: () => calls.push("requestFullscreen"),
    disableVerticalSwipes: () => calls.push("disableVerticalSwipes"),
    exitFullscreen: () => calls.push("exitFullscreen"),
    enableVerticalSwipes: () => calls.push("enableVerticalSwipes"),
  }

  enterTelegramBattleMode({Telegram: {WebApp: webApp}})
  leaveTelegramBattleMode({Telegram: {WebApp: webApp}})

  assert.deepEqual(calls, [
    "expand",
    "requestFullscreen",
    "disableVerticalSwipes",
    "exitFullscreen",
    "enableVerticalSwipes",
  ])
})
