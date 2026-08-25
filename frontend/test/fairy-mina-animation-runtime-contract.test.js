import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import {fileURLToPath} from "node:url"
import {HERO_ASSETS} from "../src/components/BattleGame/rendering/assets/assetManifest.js"

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const manifestPath = path.join(frontendRoot, "..", "tools", "blender", "hero_animation_scene_manifest.json")
const catalogPath = path.join(frontendRoot, "..", "docs", "hero-catalog.json")

test("Fairy Mina publishes the authored AimGadget runtime map", async () => {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"))
  const mina = catalog.heroes.find(hero => hero.slug === "fairy-mina")
  assert.deepEqual(manifest.hero_animation_extras?.["fairy-mina"], ["aim-gadget"])
  assert.deepEqual(mina.animations.available, [
    "idle", "run", "attack", "super", "aim", "aim-super", "hit", "death",
    "spawn", "victory", "aim-gadget",
  ])
  assert.equal(HERO_ASSETS["Fairy Mina"].clips.aimGadget, "AimGadget")
})
