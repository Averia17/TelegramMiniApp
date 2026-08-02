import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import {fileURLToPath} from "node:url"
import * as THREE from "three"

import {HERO_ASSETS} from "../src/components/BattleGame/rendering/assets/assetManifest.js"
import {GLBHeroController} from "../src/components/BattleGame/rendering/heroes/GLBHeroController.js"

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

test("Needle exposes AimGadget from GLB through the runtime map and harness", async () => {
  assert.equal(HERO_ASSETS.Needle.clips.aimGadget, "AimGadget")
  const glb = await readFile(path.join(frontendRoot, "public/assets/heroes/output_heroes/needle_base.glb"))
  const jsonLength = glb.readUInt32LE(12)
  const document = JSON.parse(glb.toString("utf8", 20, 20 + jsonLength))
  assert.ok((document.animations || []).some(animation => animation.name === "AimGadget"))
  const harness = await readFile(path.join(frontendRoot, "test/glb-hero-harness.html"), "utf8")
  assert.match(harness, /data-animation="aimGadget"/)
  assert.match(harness, /aimGadget:"AimGadget"/)
})

test("outcome interrupts an in-progress spawn and starts its authored action", () => {
  const root = new THREE.Group()
  const clips = ["idle", "run", "spawn", "victory"].map(name => new THREE.AnimationClip(name, 1, []))
  const controller = new GLBHeroController(root, clips, {
    idle: "idle",
    run: "run",
    spawn: "spawn",
    victory: "victory",
  }, {heroName: "Needle", spawnOnLoad: false})

  controller.playSpawn()
  assert.equal(controller.state, "spawn")
  controller.playOutcome("victory")

  assert.equal(controller.state, "victory")
  assert.equal(controller.locomotionSuppressed, false)
  assert.equal(controller.actions.get("victory").getEffectiveWeight(), 1)
  assert.equal(controller.actions.get("spawn").getEffectiveWeight(), 0)
})
