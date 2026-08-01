import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"
import path from "node:path"

const expectedClips = new Set([
  "idle", "run", "hit", "death", "super", "Aim", "AimSuper", "Attack", "Gadget", "Spawn", "Victory",
])
const heldRoles = new Set(["held-weapon", "throwable-weapon"])
const readGlbJson = async file => {
  const buffer = await readFile(file)
  assert.equal(buffer.toString("utf8", 0, 4), "glTF", `${file} is not GLB`)
  assert.equal(buffer.toString("utf8", 16, 20), "JSON", `${file} has no JSON chunk`)
  const length = buffer.readUInt32LE(12)
  return JSON.parse(buffer.toString("utf8", 20, 20 + length))
}

const validateHero = async (directory, slug) => {
  const file = path.join(directory, "output_heroes", `${slug}_base.glb`)
  const document = await readGlbJson(file)
  const nodes = document.nodes || []
  const parentByNode = new Map()
  nodes.forEach((node, parent) => {
    for (const child of node.children || []) parentByNode.set(child, parent)
  })

  const animationNames = new Set((document.animations || []).map(animation => animation.name))
  for (const clip of expectedClips) {
    assert.ok(animationNames.has(clip), `${slug} is missing required ${clip} clip`)
  }

  nodes.forEach((node, index) => {
    if (/^Socket\.Weapon\.[LR]$/.test(node.name || "")) {
      const parent = nodes[parentByNode.get(index)]
      assert.match(parent?.name || "", /(hand|wrist)/i, `${slug}:${node.name} must be under a hand bone`)
    }
    const role = node.extras?.attachment_role
    if (/^(HeroAttachment_(Staff|Weapon|Fans|Microphone)|MandyStaff_Attachment)/.test(node.name || "")) {
      assert.equal(role, "held-weapon", `${slug}:${node.name} must use the canonical held-weapon role`)
    }
    if (/^HeroAttachment_Speaker/.test(node.name || "")) {
      assert.equal(role, "throwable-weapon", `${slug}:${node.name} must use the throwable-weapon role`)
    }
    if (!heldRoles.has(role)) return
    if (node.extras?.grip_bone) {
      const gripBoneIndex = nodes.findIndex(candidate => candidate.name === node.extras.grip_bone)
      assert.notEqual(gripBoneIndex, -1, `${slug}:${node.name} references a missing grip bone`)
      const gripBone = nodes[gripBoneIndex]
      assert.equal(
        (gripBone.children || []).some(child =>
          nodes[child]?.name?.startsWith(`Grip.Primary.${node.name}`)),
        true,
        `${slug}:${node.name} must export a marker under its grip bone`,
      )
      return
    }
    let parentIndex = parentByNode.get(index)
    while (parentIndex !== undefined && !/^Socket\.Weapon\.[LR]$/.test(nodes[parentIndex]?.name || "")) {
      parentIndex = parentByNode.get(parentIndex)
    }
    assert.match(nodes[parentIndex]?.name || "", /^Socket\.Weapon\.[LR]$/, `${slug}:${node.name} must be under a weapon socket`)
  })
}

const heroesDirectory = path.resolve("public/assets/heroes")
const entries = [
  "brock-zeus", "damian", "fairy-mina", "kaze", "mandy", "needle",
  "persephone-lumi", "wukong-mico",
]
for (const slug of entries) {
  await validateHero(heroesDirectory, slug)
}
console.log(`Validated ${entries.length} canonical runtime hero GLBs`)
