import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import {fileURLToPath} from "node:url"

import {HERO_ASSETS} from "../src/components/BattleGame/rendering/assets/assetManifest.js"

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const readGlbJson = async url => {
  const buffer = await readFile(path.join(frontendRoot, "public", url.replace(/^\//, "")))
  assert.equal(buffer.toString("utf8", 0, 4), "glTF")
  const jsonLength = buffer.readUInt32LE(12)
  const jsonType = buffer.toString("utf8", 16, 20)
  assert.equal(jsonType, "JSON")
  return JSON.parse(buffer.toString("utf8", 20, 20 + jsonLength))
}

const expectedClips = ["Idle", "Run", "Aim", "AimSuper", "Attack", "Super", "Spawn", "Victory", "Defeat"]

for (const [heroName, asset] of Object.entries(HERO_ASSETS)) {
  test(`${heroName} canonical GLB contains the complete authored animation set`, async () => {
    const hero = await readGlbJson(asset.url)
    assert.deepEqual(
      (hero.animations || []).map(animation => animation.name).sort(),
      [...expectedClips].sort(),
    )
    for (const animation of hero.animations) {
      assert.ok(animation.channels.length > 0, `${animation.name} must animate at least one node`)
      for (const channel of animation.channels) {
        assert.ok(hero.nodes[channel.target.node]?.name, `${animation.name} has an unnamed animation target`)
      }
    }
  })
}
