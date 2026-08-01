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

const readGlbJson = async file => {
  const buffer = await readFile(file)
  assert.equal(buffer.toString("utf8", 0, 4), "glTF", `${file} is not GLB`)
  assert.equal(buffer.toString("utf8", 16, 20), "JSON", `${file} has no JSON chunk`)
  const length = buffer.readUInt32LE(12)
  return JSON.parse(buffer.toString("utf8", 20, 20 + length))
}

for (const hero of manifest.heroes) {
  test(`${hero} has one canonical runtime GLB with all skill clips`, async () => {
    const document = await readGlbJson(path.join(assetRoot, "output_heroes", `${hero}_base.glb`))
    const names = new Set((document.animations || []).map(animation => animation.name))
    assert.ok(names.has("Attack"), `${hero} is missing Attack`)
    assert.ok(names.has("super"), `${hero} is missing super`)
    assert.ok(names.has("Gadget"), `${hero} is missing Gadget`)
    await assert.rejects(
      access(path.join(assetRoot, hero, "abilities")),
      error => error?.code === "ENOENT",
      `${hero}/abilities must not duplicate the canonical runtime GLB`,
    )
  })
}
