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

for (const hero of manifest.heroes) {
  test(`${hero} has one canonical master Blender source`, async () => {
    const file = hero === "brock-zeus"
      ? path.join(sourceRoot, hero, "scenes", "zeus_rebuild_master.blend")
      : path.join(sourceRoot, hero, `${hero}.blend`)
    await assert.doesNotReject(access(file), `${hero}.blend is missing`)
  })
}
