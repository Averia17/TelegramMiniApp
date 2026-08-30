import test from "node:test"
import assert from "node:assert/strict"
import {
  enterTelegramBattleMode,
  isTelegramVersionAtLeast,
  leaveTelegramBattleMode,
  setupTelegramWebApp,
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
