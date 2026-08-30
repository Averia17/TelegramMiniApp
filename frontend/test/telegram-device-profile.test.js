import test from "node:test"
import assert from "node:assert/strict"
import {getTelegramGraphicsProfile} from "../src/utils/telegramDeviceProfile.js"

test("Telegram Android LOW devices receive a conservative WebGL profile", () => {
  const profile = getTelegramGraphicsProfile({
    navigator: {
      userAgent: "Mozilla/5.0 Telegram-Android/11.3.3 (Google sdk; Android 14; SDK 34; LOW)",
    },
  })

  assert.deepEqual(profile, {performanceClass: "low", maxPixelRatio: 1, antialias: false})
})

test("Telegram Android AVERAGE devices keep antialiasing with a moderate pixel ratio", () => {
  const profile = getTelegramGraphicsProfile({
    navigator: {
      userAgent: "Mozilla/5.0 Telegram-Android/11.3.3 (Google sdk; Android 14; SDK 34; AVERAGE)",
    },
  })

  assert.deepEqual(profile, {performanceClass: "average", maxPixelRatio: 1.25, antialias: true})
})

test("non-Telegram and high-performance clients retain the normal renderer profile", () => {
  assert.deepEqual(
    getTelegramGraphicsProfile({navigator: {userAgent: "Mozilla/5.0 Chrome/140.0"}}),
    {performanceClass: "unknown", maxPixelRatio: 1.5, antialias: true},
  )
  assert.deepEqual(
    getTelegramGraphicsProfile({navigator: {userAgent: "Telegram-Android/11.3.3 (device; HIGH)"}}),
    {performanceClass: "high", maxPixelRatio: 1.5, antialias: true},
  )
})
