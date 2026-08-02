import assert from "node:assert/strict"
import {access, readFile} from "node:fs/promises"
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
const sceneRoot = path.join(frontendRoot, "assets-source/heroes/mandy/scenes")
const runtimePath = path.join(frontendRoot, "public/assets/heroes/output_heroes/mandy_base.glb")
const weaponPath = path.join(frontendRoot, "public/assets/heroes/output_weapons/mandy_weapon.glb")

const expectedScenes = [
  "idle", "run", "attack", "super", "aim", "aim-super", "hit", "death",
  "spawn", "victory", "gadget", "aim-gadget",
]

function glbJson(buffer) {
  const jsonLength = buffer.readUInt32LE(12)
  return JSON.parse(buffer.toString("utf8", 20, 20 + jsonLength))
}

test("Mandy exposes the right-hand staff and AimGadget runtime clip", async () => {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"))
  const mandy = catalog.heroes.find(hero => hero.slug === "mandy")

  assert.deepEqual(manifest.hero_animation_extras?.mandy, ["aim-gadget"])
  assert.deepEqual(mandy.animations.available, [
    "idle", "run", "attack", "super", "aim", "aim-super", "hit", "death",
    "spawn", "victory", "aim-gadget",
  ])
  assert.equal(HERO_ASSETS.Mandy.weaponAttachments[0].target, "GripPrimaryMandyStaff_Attachment")
  assert.deepEqual(HERO_ASSETS.Mandy.weaponAttachments[0].localRotation, [
    0, 0, 60 * Math.PI / 180,
  ])
  assert.deepEqual(HERO_ASSETS.Mandy.weaponAttachments[0].localPosition, [-0.9, 0.3, -0.1])
  assert.equal(HERO_ASSETS.Mandy.clips.aimGadget, "AimGadget")
})

test("Mandy materializes the right-hand staff at Spawn brief frame 20", () => {
  const root = new THREE.Group()
  const wrist = new THREE.Bone()
  wrist.name = "R_wrist_s_064"
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

test("Mandy has all twelve focused animation scenes", async () => {
  for (const clip of expectedScenes) {
    await assert.doesNotReject(
      access(path.join(sceneRoot, `${clip}.blend`)),
      `mandy/${clip}.blend is missing`,
    )
  }
})

test("Mandy authoring contract uses +1 Blender frames and FK foot slide", async () => {
  const authoring = await readFile(path.join(repoRoot, "tools/blender/author_mandy_animation_scenes.py"), "utf8")
  assert.match(authoring, /FRAME_DURATIONS\s*=\s*\{[\s\S]*"idle": 90[\s\S]*"aim-gadget": 60/)
  assert.match(authoring, /"run": 20[\s\S]*"attack": 16[\s\S]*"super": 50/)
  assert.match(authoring, /"victory": 60/)
  assert.match(authoring, /frame\s*\+\s*1/)
  assert.match(authoring, /R_wrist_s_064/)
  assert.match(authoring, /FINGER_BONES\s*=\s*\{[\s\S]*L_index_01_s_050[\s\S]*R_index_01_s_067/)
  assert.match(authoring, /resolved_pose\.update\(poses\[brief_frame\]\)/)
  assert.match(authoring, /thigh_r=\(30, 0, 0\)[\s\S]*foot_l=\(20, 0, 0\)/)
  assert.match(authoring, /hand_r=\(0, 0, 1080\)/)
  assert.match(authoring, /root_z=0\.15[\s\S]*upper_l=\(100, 0, 0\)[\s\S]*upper_r=\(100, 0, 0\)/)
  assert.match(authoring, /foot slide/i)
  assert.doesNotMatch(authoring, /IK_TARGET|ik_target|constraint/i)
})

test("Mandy GLB contains all twelve canonical Actions", async () => {
  const document = glbJson(await readFile(runtimePath))
  assert.deepEqual(
    (document.animations || []).map(animation => animation.name).sort(),
    ["idle", "run", "Attack", "super", "Aim", "AimSuper", "hit", "death", "Spawn", "Victory", "Gadget", "AimGadget"].sort(),
  )
})

test("Mandy staff marker survives GLTFLoader name normalization", async () => {
  const document = glbJson(await readFile(runtimePath))
  const weaponDocument = glbJson(await readFile(weaponPath))
  const nodes = document.nodes || []
  const weaponRoot = (weaponDocument.nodes || []).find(node => node.name === "MandyStaff_Attachment")
  const staff = nodes.find(node => node.name === "MandyStaff_Attachment" && node.extras?.attachment_role === "held-weapon")
  const marker = nodes.find(node => node.name === "Grip.Primary.MandyStaff_Attachment")
  const gripBoneIndex = nodes.findIndex(node => node.name === staff?.extras?.grip_bone)
  const markerParentIndex = nodes.findIndex(node => node.children?.includes(nodes.indexOf(marker)))
  assert.ok(staff?.mesh !== undefined)
  assert.equal(weaponRoot?.extras?.grip_authored_root, true)
  assert.ok(marker)
  assert.equal(markerParentIndex, gripBoneIndex)
  assert.equal(marker.name.replaceAll(".", ""), HERO_ASSETS.Mandy.weaponAttachments[0].target)

  assert.ok(weaponRoot?.mesh !== undefined)
})
