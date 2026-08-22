import assert from "node:assert/strict"
import {access, readFile} from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import {fileURLToPath} from "node:url"

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const assetRoot = path.join(frontendRoot, "public", "assets", "heroes")
const manifest = JSON.parse(await readFile(
  path.join(frontendRoot, "..", "tools", "blender", "hero_animation_scene_manifest.json"),
  "utf8",
))

for (const hero of manifest.heroes) {
  test(`${hero} has no legacy duplicated ability assets`, async () => {
    await assert.rejects(
      access(path.join(assetRoot, hero, "abilities")),
      error => error?.code === "ENOENT",
      `${hero}/abilities must not duplicate the canonical runtime GLB`,
    )
  })
}
