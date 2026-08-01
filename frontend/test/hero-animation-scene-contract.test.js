import assert from "node:assert/strict"
import {access, readFile} from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import {fileURLToPath} from "node:url"

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const sourceRoot = path.join(frontendRoot, "assets-source", "heroes")
const manifest = JSON.parse(await readFile(
  path.join(frontendRoot, "..", "tools", "blender", "hero_animation_scene_manifest.json"),
  "utf8",
))

const expectedSceneClips = [
  "idle", "run", "attack", "super", "aim", "aim-super", "hit", "death", "spawn", "victory", "gadget",
]

for (const hero of manifest.heroes) {
  test(`${hero} has one authored Blender scene for every runtime event`, async () => {
    for (const clip of expectedSceneClips) {
      const file = path.join(sourceRoot, hero, "scenes", `${clip}.blend`)
      await assert.doesNotReject(access(file), `${hero}/${clip}.blend is missing`)
    }
  })
}
