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

test("Kaze publishes twelve authored actions and a detached left/right weapon pair", async () => {
  const asset = HERO_ASSETS.Kaze
  assert.equal(asset.clips.aimGadget, "AimGadget")
  assert.equal(asset.weaponUrl, "/assets/heroes/output_weapons/kaze_weapon.glb")

  const character = await readGlbJson(asset.url)
  assert.deepEqual(
    [...new Set((character.animations || []).map(animation => animation.name))].sort(),
    ["Aim", "AimGadget", "AimSuper", "Attack", "Gadget", "Spawn", "Victory", "death", "hit", "idle", "run", "super"].sort(),
  )

  const characterNodes = new Set((character.nodes || []).map(node => node.name).filter(Boolean))
  assert.equal(characterNodes.has("HeroAttachment_FanLeft"), false)
  assert.equal(characterNodes.has("HeroAttachment_FanRight"), false)
  assert.equal(characterNodes.has("Grip.Primary.HeroAttachment_FanLeft"), true)
  assert.equal(characterNodes.has("Grip.Primary.HeroAttachment_FanRight"), true)

  const weapons = await readGlbJson(asset.weaponUrl)
  assert.deepEqual(
    [...new Set((weapons.nodes || []).map(node => node.name))].sort(),
    ["HeroAttachment_FanLeft", "HeroAttachment_FanRight"].sort(),
  )
})
