import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import {fileURLToPath} from "node:url"
import * as THREE from "three"
import {HERO_ASSETS} from "../src/components/BattleGame/rendering/assets/assetManifest.js"
import {GLBHeroController} from "../src/components/BattleGame/rendering/heroes/GLBHeroController.js"

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const repoRoot = path.resolve(frontendRoot, "..")
const manifestPath = path.join(repoRoot, "tools/blender/hero_animation_scene_manifest.json")
const catalogPath = path.join(repoRoot, "docs/hero-catalog.json")
const runtimePath = path.join(frontendRoot, "public/assets/heroes/output_heroes/mandy_base.glb")

function glbJson(buffer) {
  const jsonLength = buffer.readUInt32LE(12)
  return JSON.parse(buffer.toString("utf8", 20, 20 + jsonLength))
}

test("Mandy exposes the left-hand staff and AimGadget runtime clip", async () => {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"))
  const mandy = catalog.heroes.find(hero => hero.slug === "mandy")

  assert.deepEqual(manifest.hero_animation_extras?.mandy, ["aim-gadget"])
  assert.deepEqual(mandy.animations.available, [
    "idle", "run", "attack", "super", "aim", "aim-super", "hit", "death",
    "spawn", "victory", "stunned", "aim-gadget",
  ])
  assert.equal("weaponUrl" in HERO_ASSETS.Mandy, false)
  assert.equal("weaponAttachments" in HERO_ASSETS.Mandy, false)
  assert.equal(HERO_ASSETS.Mandy.clips.aimGadget, "AimGadget")
})

test("Mandy materializes the left-hand staff at Spawn brief frame 20", () => {
  const root = new THREE.Group()
  const wrist = new THREE.Bone()
  wrist.name = "L_wrist_s_047"
  const staff = new THREE.Group()
  staff.name = "MandyStaff_Attachment"
  staff.userData.attachment_role = "held-weapon"
  wrist.add(staff)
  root.add(wrist)
  const spawn = new THREE.AnimationClip("Spawn", 45 / 30, [])
  const controller = new GLBHeroController(root, [spawn], {spawn: "Spawn"}, {
    heroName: "Mandy",
    spawnOnLoad: false,
  })

  controller.playSpawn()
  assert.equal(staff.visible, false)
  controller.update(19 / 30, {alive: true})
  assert.equal(staff.visible, false)
  controller.update(1 / 30, {alive: true})
  assert.equal(staff.visible, true)
  controller.dispose()
})

test("Mandy staff marker survives GLTFLoader name normalization", async () => {
  const document = glbJson(await readFile(runtimePath))
  const nodes = document.nodes || []
  const staff = nodes.find(node => node.name === "MandyStaff_Attachment" && node.extras?.attachment_role === "held-weapon")
  const marker = nodes.find(node => node.name === "Grip.Primary.MandyStaff_Attachment")
  const gripBoneIndex = nodes.findIndex(node => node.name === staff?.extras?.grip_bone)
  const markerParentIndex = nodes.findIndex(node => node.children?.includes(nodes.indexOf(marker)))
  assert.ok(staff?.mesh !== undefined)
  assert.ok(marker)
  assert.equal(markerParentIndex, gripBoneIndex)
  assert.equal(marker.name.replaceAll(".", ""), "GripPrimaryMandyStaff_Attachment")
  assert.equal(staff?.extras?.grip_bone, "L_wrist_s_047")
})
