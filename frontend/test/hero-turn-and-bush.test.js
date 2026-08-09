import test from "node:test"
import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"
import {fileURLToPath} from "node:url"
import path from "node:path"

import {
  advanceSmoothTurn,
  turnTowardsAngle,
} from "../src/components/BattleGame/rendering/heroes/turning.js"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

test("hero turn speed is capped so a reversal cannot snap in one frame", () => {
  const frame = 1 / 60
  const maximumTurnSpeed = 6.5
  const turned = turnTowardsAngle(0, Math.PI, frame)

  assert.ok(Math.abs(turned) <= maximumTurnSpeed * frame + 1e-9)
})

test("hero turning follows the shortest path across the angle seam", () => {
  const current = Math.PI - 0.04
  const target = -Math.PI + 0.04
  const turned = turnTowardsAngle(current, target, 1 / 60)

  assert.ok(turned > current)
  assert.ok(turned - current < 0.04)
})

test("rapid left-right input brakes rotation before reversing it", () => {
  const frame = 1 / 60
  const turningRight = advanceSmoothTurn(0, Math.PI / 2, 3, frame)
  const reversedInput = advanceSmoothTurn(
    turningRight.angle,
    -Math.PI / 2,
    turningRight.velocity,
    frame,
  )

  assert.ok(turningRight.velocity > 0)
  assert.ok(reversedInput.velocity >= 0)
  assert.ok(reversedInput.angle >= turningRight.angle)
})

test("alternating turn targets cannot create frame-to-frame angular velocity spikes", () => {
  const frame = 1 / 60
  let angle = 0
  let velocity = 0
  let previousVelocity = 0

  for (let index = 0; index < 30; index += 1) {
    const turn = advanceSmoothTurn(angle, index % 2 ? -Math.PI / 2 : Math.PI / 2, velocity, frame)
    assert.ok(Math.abs(turn.velocity - previousVelocity) <= 28 * frame + 1e-9)
    angle = turn.angle
    velocity = turn.velocity
    previousVelocity = velocity
  }
})

test("bush concealment does not attach an animated leaf wreath to the hero", async () => {
  const heroView = await readFile(
    path.join(projectRoot, "src/components/BattleGame/rendering/heroes/HeroView.js"),
    "utf8",
  )

  assert.doesNotMatch(heroView, /createBushOcclusion|updateBushOcclusion|bushOcclusion/)
})

test("fallback hero hit flash uses cached materials instead of traversing every frame", async () => {
  const heroView = await readFile(
    path.join(projectRoot, "src/components/BattleGame/rendering/heroes/HeroView.js"),
    "utf8",
  )

  assert.match(heroView, /this\.hitMaterials = collectHitMaterials\(this\.modelMaterials\)/)
  assert.doesNotMatch(heroView, /if \(!this\.animation\) this\.model\.traverse\(/)
})
