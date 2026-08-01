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
  test(`${hero} has standalone GLB assets for every skill`, async () => {
    for (const clip of manifest.ability_clips) {
      const file = path.join(assetRoot, hero, "abilities", `${clip}.glb`)
      await assert.doesNotReject(
        access(file),
        `${hero}/${clip}.glb is missing`,
      )
      const document = await readGlbJson(file)
      const actionName = {attack: "Attack", super: "super", gadget: "Gadget"}[clip]
      assert.ok(
        (document.animations || []).some(animation => animation.name === actionName),
        `${hero}/${clip}.glb is missing ${actionName} animation`,
      )
    }
  })

  test(`${hero} canonical GLB exposes the authored Gadget clip`, async () => {
    const document = await readGlbJson(path.join(assetRoot, "output_heroes", `${hero}_base.glb`))
    const names = new Set((document.animations || []).map(animation => animation.name))
    assert.ok(names.has("Attack"), `${hero} is missing Attack`)
    assert.ok(names.has("super"), `${hero} is missing super`)
    assert.ok(names.has("Gadget"), `${hero} is missing Gadget`)
  })
}
