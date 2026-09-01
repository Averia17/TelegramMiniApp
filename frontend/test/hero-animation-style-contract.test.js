import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"
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

test("the authoring pipeline keeps all standard clips inside the master Actions", async () => {
  const source = await readFile(path.join(root, "tools/blender/author_brawl_style_animation_overhaul.py"), "utf8")
  for (const action of ["idle", "run", "Attack", "super", "Aim", "AimSuper", "hit", "death", "Spawn", "Victory", "Gadget", "Stunned"]) {
    assert.match(source, new RegExp(`['\"]${action}['\"]`))
  }
  assert.match(source, /authoring_action_name/)
  assert.match(source, /BEZIER/)
})
