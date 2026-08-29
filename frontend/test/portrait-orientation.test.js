import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import {isMobileLandscape, requestPortraitOrientationLock} from "../src/utils/orientation.js"

test("mobile landscape detection is limited to phone-sized or coarse-pointer viewports", () => {
  assert.equal(isMobileLandscape({width: 844, height: 390, coarsePointer: true}), true)
  assert.equal(isMobileLandscape({width: 844, height: 390, coarsePointer: false}), false)
  assert.equal(isMobileLandscape({width: 1200, height: 700, coarsePointer: true}), true)
  assert.equal(isMobileLandscape({width: 700, height: 900, coarsePointer: false}), false)
})

test("portrait lock requests Telegram and browser orientation APIs without leaking rejection", async () => {
  let telegramLocks = 0
  let browserLock = ""
  const platform = {
    Telegram: {WebApp: {lockOrientation: () => { telegramLocks += 1 }}},
    screen: {orientation: {lock: async mode => { browserLock = mode }}},
  }

  assert.equal(await requestPortraitOrientationLock(platform), true)
  assert.equal(telegramLocks, 1)
  assert.equal(browserLock, "portrait")

  const rejected = await requestPortraitOrientationLock({screen: {orientation: {lock: async () => { throw new Error("unsupported") }}}})
  assert.equal(rejected, false)

  let legacyTelegramLocks = 0
  await requestPortraitOrientationLock({Telegram: {WebApp: {version: "6.0", lockOrientation: () => { legacyTelegramLocks += 1 }}}})
  assert.equal(legacyTelegramLocks, 0)
})

test("portrait mode is declared in the document and guarded in the application shell", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8")
  const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8")

  assert.match(html, /name="screen-orientation" content="portrait"/)
  assert.match(app, /requestPortraitOrientationLock/)
  assert.match(app, /portrait-orientation-guard/)
})
