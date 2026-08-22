import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import {fileURLToPath} from "node:url"

import {HERO_ASSETS} from "../src/components/BattleGame/rendering/assets/assetManifest.js"

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const readGlbJson = async url => {
  const buffer = await readFile(path.join(frontendRoot, "public", url.replace(/^\//, "")))
  const jsonLength = buffer.readUInt32LE(12)
  return JSON.parse(buffer.toString("utf8", 20, 20 + jsonLength))
}

test("Kaze publishes an embedded left/right weapon pair", async () => {
  const asset = HERO_ASSETS.Kaze
  assert.equal(asset.clips.aimGadget, "AimGadget")
  assert.equal("weaponUrl" in asset, false)
  assert.equal("weaponAttachments" in asset, false)

  const character = await readGlbJson(asset.url)
  const characterNodes = new Set((character.nodes || []).map(node => node.name).filter(Boolean))
  assert.equal(characterNodes.has("HeroAttachment_FanLeft"), true)
  assert.equal(characterNodes.has("HeroAttachment_FanRight"), true)
  assert.equal(characterNodes.has("Grip.Primary.HeroAttachment_FanLeft"), true)
  assert.equal(characterNodes.has("Grip.Primary.HeroAttachment_FanRight"), true)
})
