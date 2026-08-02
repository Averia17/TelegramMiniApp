import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import {fileURLToPath} from "node:url"
import {HERO_ASSETS} from "../src/components/BattleGame/rendering/assets/assetManifest.js"

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const manifestPath = path.join(frontendRoot, "..", "tools", "blender", "hero_animation_scene_manifest.json")
const catalogPath = path.join(frontendRoot, "..", "docs", "hero-catalog.json")
const runtimePath = path.join(frontendRoot, "public/assets/heroes/output_heroes/fairy-mina_base.glb")

const glbJson = buffer => {
  assert.equal(buffer.toString("utf8", 0, 4), "glTF")
  const jsonLength = buffer.readUInt32LE(12)
  return JSON.parse(buffer.toString("utf8", 20, 20 + jsonLength))
}

test("Fairy Mina publishes the twelve authored actions and AimGadget runtime map", async () => {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"))
  const mina = catalog.heroes.find(hero => hero.slug === "fairy-mina")
  assert.deepEqual(manifest.hero_animation_extras?.["fairy-mina"], ["aim-gadget"])
  assert.deepEqual(mina.animations.available, [
    "idle", "run", "attack", "super", "aim", "aim-super", "hit", "death",
    "spawn", "victory", "aim-gadget",
  ])
  assert.equal(HERO_ASSETS["Fairy Mina"].clips.aimGadget, "AimGadget")
  const document = glbJson(await readFile(runtimePath))
  assert.deepEqual((document.animations || []).map(animation => animation.name).sort(), [
    "Aim", "AimGadget", "AimSuper", "Attack", "Gadget", "Spawn", "Victory",
    "death", "hit", "idle", "run", "super",
  ].sort())
})
