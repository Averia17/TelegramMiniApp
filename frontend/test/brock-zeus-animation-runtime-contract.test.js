import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"
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

test("Brock Zeus publishes a separate companion cloud asset", async () => {
  const asset = HERO_ASSETS["Brock Zeus"]
  assert.equal(asset.url, "/assets/heroes/output_heroes/brock-zeus-rebuild-v10_base.glb")
  assert.equal(asset.clips.aimGadget, "AimGadget")
  assert.equal(asset.companionUrl, "/assets/heroes/output_heroes/brock-zeus-rebuild-v10_cloud.glb")
  const character = await readGlbJson(asset.url)
  const nodeNames = new Set((character.nodes || []).map(node => node.name).filter(Boolean))
  assert.equal([...nodeNames].some(name => /cloud|locator/i.test(name)), false)
  for (const name of ["BrockZeus_Rig", "Root", "R_Elbow", "R_Hand", "ZeusPart_Head", "ZeusPart_R_Hand", "ZeusPart_L_Hand"]) {
    assert.equal(nodeNames.has(name), true, `Brock Zeus archive rebuild must publish ${name}`)
  }
  assert.deepEqual(
    [...new Set((character.animations || []).map(animation => animation.name))].sort(),
    ["Aim", "AimGadget", "AimSuper", "Attack", "Gadget", "Spawn", "Victory", "death", "hit", "idle", "run", "super"].sort(),
  )
  const attack = character.animations.find(animation => animation.name === "Attack")
  assert.ok(attack, "Brock Zeus Attack clip must be present")
  const cloud = await readGlbJson(asset.companionUrl)
  assert.equal((cloud.meshes || []).length > 0, true)
  assert.equal([...new Set((cloud.nodes || []).map(node => node.name).filter(Boolean))].some(name => /cloud/i.test(name)), true)
  const cloudAnimations = cloud.animations || []
  assert.deepEqual([...new Set(cloudAnimations.map(animation => animation.name))].sort(), [
    "Cloud_Aim", "Cloud_AimGadget", "Cloud_AimSuper", "Cloud_Attack", "Cloud_Gadget",
    "Cloud_Spawn", "Cloud_Victory", "Cloud_death", "Cloud_hit", "Cloud_idle", "Cloud_root_idle", "Cloud_run", "Cloud_super",
  ].sort())
  const cloudAttack = cloudAnimations.find(animation => animation.name === "Cloud_Attack")
  assert.ok(cloudAttack, "Brock Zeus Cloud_Attack clip must be present")
})
