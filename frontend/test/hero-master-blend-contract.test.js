import assert from "node:assert/strict"
import {access, readFile} from "node:fs/promises"
import {existsSync} from "node:fs"
import path from "node:path"
import test from "node:test"
import {fileURLToPath} from "node:url"

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const repoRoot = path.resolve(frontendRoot, "..")
const sourceRoot = path.join(frontendRoot, "assets-source", "heroes")
const manifest = JSON.parse(await readFile(
  path.join(repoRoot, "tools", "blender", "hero_animation_scene_manifest.json"),
  "utf8",
))

const heroes = [...manifest.heroes]

for (const hero of heroes) {
  test(`${hero} has one canonical master blend source`, async () => {
    const file = hero === "brock-zeus"
      ? path.join(sourceRoot, hero, "scenes", "zeus_rebuild_master.blend")
      : path.join(sourceRoot, hero, `${hero}.blend`)
    await assert.doesNotReject(access(file))
  })
}

test("master exporter is the canonical source exporter", async () => {
  const exporter = await readFile(
    path.join(repoRoot, "tools", "blender", "export_runtime_heroes_from_master_blends.py"),
    "utf8",
  )
  assert.match(exporter, /master_path\(hero\)/)
  assert.match(exporter, /export_animation_mode=\"ACTIONS\"/)
  assert.doesNotMatch(exporter, /focused_scenes/)
})

test("focused-scene exporter has been removed from the source contract", () => {
  assert.equal(
    existsSync(path.join(repoRoot, "tools", "blender", "export_runtime_heroes_from_scenes.py")),
    false,
  )
})

test("master validator covers all canonical heroes and required actions", async () => {
  const validator = await readFile(
    path.join(repoRoot, "tools", "blender", "validate_master_hero_sources.py"),
    "utf8",
  )
  assert.match(validator, /hero_animation_scene_manifest/)
  assert.match(validator, /required_actions|REQUIRED_ACTIONS/)
  assert.match(validator, /Cloud_AimGadget|Cloud_root_idle/)
})
