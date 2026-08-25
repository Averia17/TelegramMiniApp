import assert from "node:assert/strict"
import test from "node:test"
import {readFile} from "node:fs/promises"
import * as THREE from "three"

import {CLOWN_TAUNT_DISPLAY_SCALE, createClownTaunt} from "../src/components/BattleGame/rendering/heroes/tauntVisuals.js"

test("taunt is rendered over the player who triggered it", async () => {
  const source = await readFile(new URL("../src/components/BattleGame/BattleGame.jsx", import.meta.url), "utf8")
  const rendererSource = await readFile(new URL("../src/components/BattleGame/Renderer.js", import.meta.url), "utf8")

  assert.match(source, /const tauntPlayerId = msg\.params\?\.playerId/)
  assert.match(source, /showTaunt\(tauntPlayerId, msg\.params\?\.tauntId\)/)
  assert.doesNotMatch(source, /showTaunt\(msg\.params\?\.targetId, msg\.params\?\.tauntId\)/)
  assert.match(source, /rendererRef\.current\?\.showTaunt\(clientRef\.current\?\.playerId, "clown_laugh"\)/)
  assert.match(rendererSource, /showTaunt\(playerId, tauntId\) \{ return this\.impl\.showTaunt\(playerId, tauntId\) \}/)
})

test("clown taunt stays compact above the hero", () => {
  const clown = createClownTaunt()
  const size = new THREE.Vector3()
  new THREE.Box3().setFromObject(clown).getSize(size)

  assert.ok(size.x * CLOWN_TAUNT_DISPLAY_SCALE < 1.7)
  assert.ok(size.y * CLOWN_TAUNT_DISPLAY_SCALE < 2.0)
  clown.traverse(child => {
    if (!child.isMesh) return
    assert.equal(child.renderOrder, 30)
    assert.equal(child.material.transparent, true)
    assert.equal(child.material.depthTest, false)
    assert.equal(child.material.depthWrite, false)
  })
  clown.traverse(child => child.geometry?.dispose())
  clown.traverse(child => child.material?.dispose())
})
