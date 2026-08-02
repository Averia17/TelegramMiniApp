import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import {fileURLToPath} from "node:url"
import * as THREE from "three"

import {HERO_ASSETS} from "../src/components/BattleGame/rendering/assets/assetManifest.js"

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const readGlbJson = async url => {
  const buffer = await readFile(path.join(frontendRoot, "public", url.replace(/^\//, "")))
  const jsonLength = buffer.readUInt32LE(12)
  return JSON.parse(buffer.toString("utf8", 20, 20 + jsonLength))
}

const localMatrix = node => {
  if (node.matrix) return new THREE.Matrix4().fromArray(node.matrix)
  return new THREE.Matrix4().compose(
    new THREE.Vector3().fromArray(node.translation || [0, 0, 0]),
    new THREE.Quaternion().fromArray(node.rotation || [0, 0, 0, 1]),
    new THREE.Vector3().fromArray(node.scale || [1, 1, 1]),
  )
}

for (const [heroName, asset] of Object.entries(HERO_ASSETS)) {
  test(`${heroName} held equipment has a grip marker aligned with its weapon socket`, async t => {
    const document = await readGlbJson(asset.url)
    const nodes = document.nodes || []
    const parents = new Map()
    nodes.forEach((node, parent) => (node.children || []).forEach(child => parents.set(child, parent)))
    const equipment = nodes
      .map((node, index) => ({node, index}))
      .filter(({node}) => ["held-weapon", "throwable-weapon"].includes(node.extras?.attachment_role))
    if (!equipment.length) {
      t.skip("hero has no authored held equipment")
      return
    }

    const worldMatrix = index => {
      const chain = []
      for (let current = index; current !== undefined; current = parents.get(current)) chain.unshift(current)
      return chain.reduce((world, current) => world.multiply(localMatrix(nodes[current])), new THREE.Matrix4())
    }

    for (const {node, index} of equipment) {
      if (node.extras?.grip_bone) {
        const gripBoneIndex = nodes.findIndex(candidate => candidate.name === node.extras.grip_bone)
        assert.notEqual(gripBoneIndex, -1, `${node.name} references missing grip bone`)
        const markerIndex = nodes.findIndex(candidate =>
          candidate.name?.startsWith(`Grip.Primary.${node.name}`) && parents.get(nodes.indexOf(candidate)) === gripBoneIndex)
        assert.notEqual(markerIndex, -1, `${node.name} is missing a marker under its grip bone`)
        const ancestors = []
        for (let current = gripBoneIndex; current !== undefined; current = parents.get(current)) {
          ancestors.push(nodes[current]?.name || "")
        }
        assert.equal(ancestors.some(name => /(hand|wrist)/i.test(name)), true, `${node.name} grip bone is not under a hand`)
      } else {
        let socketIndex = parents.get(index)
        while (socketIndex !== undefined && !/^Socket\.Weapon\.[LR]$/.test(nodes[socketIndex]?.name || "")) {
          socketIndex = parents.get(socketIndex)
        }
        assert.match(nodes[socketIndex]?.name || "", /^Socket\.Weapon\.[LR]$/)
        const descendants = []
        const collectDescendants = current => {
          for (const child of nodes[current]?.children || []) {
            descendants.push(child)
            collectDescendants(child)
          }
        }
        collectDescendants(socketIndex)
        const gripIndex = (node.children || []).find(child =>
          nodes[child]?.name?.startsWith("Grip.Primary"))
          ?? descendants.find(child =>
            nodes[child]?.name?.startsWith(`Grip.Primary.${node.name}`))
        assert.notEqual(gripIndex, undefined, `${node.name} is missing Grip.Primary`)
        const socketPosition = new THREE.Vector3().setFromMatrixPosition(worldMatrix(socketIndex))
        const gripPosition = new THREE.Vector3().setFromMatrixPosition(worldMatrix(gripIndex))
        assert.ok(
          socketPosition.distanceTo(gripPosition) < 0.001,
          `${node.name} grip is ${socketPosition.distanceTo(gripPosition)} units from its socket`,
        )
      }
    }
  })

  test(`${heroName} attack is driven by the full arm chain`, async () => {
    const document = await readGlbJson(asset.url)
    const nodes = document.nodes || []
    const attack = (document.animations || []).find(animation => animation.name === "Attack")
    assert.ok(attack, `${heroName} is missing Attack`)
    const animatedNames = new Set(
      attack.channels
        .filter(channel => channel.target?.path === "rotation")
        .map(channel => nodes[channel.target.node]?.name || ""),
    )
    const chainPatterns = [
      ["shoulder", /(shoulder|upperarm|(?:left|right)arm)/i],
      ["elbow", /(elbow|forearm|lowerarm)/i],
      ["wrist", /(wrist|hand)/i],
      ["torso", /(spine|chest)/i],
    ]
    // Needle's legacy source rig has a two-bone arm named Arm -> Hand; Hand
    // carries both the forearm bend and the projectile socket.
    if (heroName === "Needle") chainPatterns[1][1] = /hand/i
    for (const [label, pattern] of chainPatterns) {
      assert.equal(
        [...animatedNames].some(name => pattern.test(name)),
        true,
        `${heroName} Attack does not animate its ${label}`,
      )
    }
  })
}

test("Kaze uses the standardized detached fan weapon", async () => {
  const document = await readGlbJson(HERO_ASSETS.Kaze.url)
  const nodes = document.nodes || []
  const socket = nodes.find(node => node.name === "weapon_socket_r")
  assert.ok(socket, "Kaze is missing weapon_socket_r")
  assert.equal(HERO_ASSETS.Kaze.weaponUrl, "/assets/heroes/output_weapons/kaze_weapon.glb")
})
