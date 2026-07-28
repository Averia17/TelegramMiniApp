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

for (const [heroName, asset] of Object.entries(HERO_ASSETS)) {
  test(`${heroName} event GLBs contain one compatible authored clip each`, async () => {
    const base = await readGlbJson(asset.url)
    const baseNodeNames = new Set((base.nodes || []).map(node => node.name).filter(Boolean))

    for (const [eventName, eventAsset] of Object.entries(asset.eventAnimations)) {
      const event = await readGlbJson(eventAsset.url)
      assert.equal(event.animations?.length, 1, `${eventName} must export exactly one clip`)
      assert.equal(event.animations[0].name, eventAsset.clip)
      assert.ok(event.animations[0].channels.length > 0, `${eventName} must animate at least one node`)
      for (const channel of event.animations[0].channels) {
        const targetName = event.nodes[channel.target.node]?.name
        assert.ok(targetName, `${eventName} has an unnamed animation target`)
        assert.ok(baseNodeNames.has(targetName), `${eventName} targets missing base node ${targetName}`)
      }
    }
  })
}
