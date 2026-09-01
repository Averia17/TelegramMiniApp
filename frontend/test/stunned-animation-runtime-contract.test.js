import test from "node:test"
import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"

const read = file => readFile(new URL(file, import.meta.url), "utf8")

test("the hero animation contract publishes a Stunned clip for every hero", async () => {
  const [manifest, contract, assets, validator] = await Promise.all([
    read("../../tools/blender/hero_animation_scene_manifest.json"),
    read("../../tools/blender/hero_animation_contract.py"),
    read("../src/components/BattleGame/rendering/assets/assetManifest.js"),
    read("../../frontend/scripts/validate-hero-glb.mjs"),
  ])

  assert.match(manifest, /"stunned"/)
  assert.match(contract, /"stunned"\s*:\s*"Stunned"/)
  assert.match(assets, /stunned:\s*"Stunned"/)
  assert.match(validator, /"Stunned"/)
})

test("HeroView forwards the authoritative stun status to the animation controller", async () => {
  const heroView = await read("../src/components/BattleGame/rendering/heroes/HeroView.js")
  const controller = await read("../src/components/BattleGame/rendering/heroes/GLBHeroController.js")

  assert.match(heroView, /stun:\s*this\.state\.stun/)
  assert.match(controller, /input\.stun/)
  assert.match(controller, /playSafe\("stunned"/)
})
