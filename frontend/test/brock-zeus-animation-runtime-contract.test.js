import assert from "node:assert/strict"
import {access, readFile} from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import {fileURLToPath} from "node:url"

import {HERO_ASSETS} from "../src/components/BattleGame/rendering/assets/assetManifest.js"

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const readGlbJson = async url => {
  const buffer = await readFile(path.join(frontendRoot, "public", url.replace(/^\//, "")))
  assert.equal(buffer.toString("utf8", 0, 4), "glTF")
  const jsonLength = buffer.readUInt32LE(12)
  return JSON.parse(buffer.toString("utf8", 20, 20 + jsonLength))
}

test("Brock Zeus publishes twelve actions and a separate companion cloud asset", async () => {
  const asset = HERO_ASSETS["Brock Zeus"]
  assert.equal(asset.clips.aimGadget, "AimGadget")
  assert.equal(asset.companionUrl, "/assets/heroes/output_heroes/brock-zeus_cloud.glb")
  const character = await readGlbJson(asset.url)
  const actionNames = new Set((character.animations || []).map(animation => animation.name))
  assert.deepEqual([...actionNames].sort(), [
    "Aim", "AimGadget", "AimSuper", "Attack", "Gadget", "Spawn", "Victory",
    "death", "hit", "idle", "run", "super",
  ].sort())
  const nodeNames = new Set((character.nodes || []).map(node => node.name).filter(Boolean))
  assert.equal([...nodeNames].some(name => /cloud|locator/i.test(name)), false)
  const cloud = await readGlbJson(asset.companionUrl)
  assert.equal((cloud.meshes || []).length > 0, true)
  assert.equal([...new Set((cloud.nodes || []).map(node => node.name).filter(Boolean))].some(name => /cloud/i.test(name)), true)
  const cloudAnimations = cloud.animations || []
  assert.deepEqual([...new Set(cloudAnimations.map(animation => animation.name))].sort(), [
    "Cloud_Aim", "Cloud_AimGadget", "Cloud_AimSuper", "Cloud_Attack", "Cloud_Gadget",
    "Cloud_Spawn", "Cloud_Victory", "Cloud_death", "Cloud_hit", "Cloud_idle", "Cloud_run", "Cloud_super",
  ].sort())
  for (const animation of cloudAnimations) {
    assert.deepEqual(
      new Set(animation.channels?.map(channel => channel.target?.path)),
      new Set(["translation", "rotation", "scale"]),
      `${animation.name} must animate movement, rotation, and scale`,
    )
  }
  await access(path.join(frontendRoot, "public/assets/heroes/output_heroes/brock-zeus_cloud.glb"))
})
