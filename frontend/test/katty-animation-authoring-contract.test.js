import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import {fileURLToPath} from "node:url"

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const buildScript = path.join(
  frontendRoot,
  "assets-source",
  "heroes",
  "katty",
  "build_katty_animations.py",
)

test("Katty's left elbow only flexes in the rig's anatomical direction", async () => {
  const source = await readFile(buildScript, "utf8")
  const authoredAngles = [...source.matchAll(
    /"L_elbow_s":\s*\{"rot":\s*\(0,\s*0,\s*(-?\d+(?:\.\d+)?)\)\}/g,
  )].map((match) => Number(match[1]))

  assert.ok(authoredAngles.length > 0, "no authored left-elbow poses found")
  assert.ok(
    authoredAngles.every((angle) => angle <= 0),
    `left-elbow Z rotations must be non-positive, got ${authoredAngles.join(", ")}`,
  )
  assert.match(
    source,
    /DEFAULT_HANDS\s*=\s*\{[\s\S]*?"L_elbow_s":\s*\{"rot":\s*\(0,\s*0,\s*-[1-9]\d*(?:\.\d+)?\)\}[\s\S]*?\n\}/,
    "the neutral pose must keep the left elbow flexed between explicit animation keys",
  )
})

test("Katty's death animation has an authored recoil pop before the bottle toss and collapse", async () => {
  const source = await readFile(buildScript, "utf8")

  assert.match(source, /death_pop\s*=\s*\{/)
  assert.match(source, /8:\s*death_anticipation/)
  assert.match(source, /17:\s*death_pop/)
  assert.match(source, /31:\s*\{\*\*fallen,\s*\*\*RIGHT_OPEN\}/)
  assert.match(source, /"death_style"\]\s*=\s*"spray-can-bailout"/)
})
