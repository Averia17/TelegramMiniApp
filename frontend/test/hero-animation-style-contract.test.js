import {access, readFile} from "node:fs/promises"
import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import {fileURLToPath} from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")

test("the full hero animation brief publishes stable Brawl-readable frame ranges", async () => {
  const manifest = JSON.parse(await readFile(path.join(root, "tools/blender/hero_animation_scene_manifest.json"), "utf8"))
  assert.equal(manifest.style_revision, "brawl-readable-v1")
  assert.deepEqual(manifest.clip_frame_ranges, {
    idle: [1, 60], run: [1, 20], attack: [1, 25], super: [1, 40],
    aim: [1, 15], "aim-super": [1, 15], hit: [1, 12], death: [1, 45],
    spawn: [1, 30], victory: [1, 90], gadget: [1, 20], stunned: [1, 30],
  })
})

test("master blends are the only animation authoring source", async () => {
  const mutationScripts = [
    "author_brawl_style_animation_overhaul.py",
    "author_skill_animation_semantics.py",
    "author_stunned_animations.py",
    "enhance_death_animations.py",
    "polish_hero_pose_continuity.py",
    "polish_locomotion_secondary_motion.py",
    "polish_skill_secondary_motion.py",
    "rebase_fairy_mina_arm_actions.py",
    "refine_all_skill_intents.py",
    "refine_animation_angles.py",
    "refine_brock_zeus_attack.py",
    "refine_semantic_revision3.py",
    "refine_skill_animation_readability.py",
    "repair_all_hero_rig_connections.py",
    "repair_fairy_mina_idle_arm_pose.py",
    "repair_fairy_mina_rig.py",
    "repair_idle_secondary_motion.py",
    "repair_remaining_pose_tracks.py",
    "smooth_all_idle_frame_steps.py",
    "split_fairy_mina_body_mesh.py",
    "split_fairy_mina_head_torso.py",
  ]
  for (const script of mutationScripts) {
    await assert.rejects(access(path.join(root, "tools/blender", script)))
  }
})
