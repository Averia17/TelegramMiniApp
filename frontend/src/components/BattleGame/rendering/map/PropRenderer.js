import * as THREE from "three"
import {WORLD_SCALE} from "../shared/coordinates.js"
import {createColoredBox, createContactShadow, flatMaterial} from "../shared/materials.js"
import {createStoneBlockGeometry} from "./StoneBlockGeometry.js"

const propColors = {
  wall: 0x4d5a5b,
  fence: 0x8b5436,
  crates: 0xb86f31,
  barrels: 0xa6463c,
  cactus: 0x2f9b52,
  crystal: 0x7653dc,
  bones: 0xe7d9b7,
  destructible: 0x64635f,
  tree: 0x4f352b,
  dead_tree: 0x77736a,
  shipwreck: 0x6f4b35,
  altar_three_moons: 0x5079b4,
  sacrificial_stone: 0x8e394c,
  menhir: 0x626879,
}
const STONE_PROP_TYPES = new Set(["wall", "destructible", "sacrificial_stone", "menhir"])

export const createProp = (wall, index, waterTexture) => {
  const width = Math.max(2, wall.maxX - wall.minX) * WORLD_SCALE
  const depth = Math.max(2, wall.maxY - wall.minY) * WORLD_SCALE
  const group = new THREE.Group()
  group.position.set(
    (wall.minX + wall.maxX) * 0.5 * WORLD_SCALE,
    0,
    (wall.minY + wall.maxY) * 0.5 * WORLD_SCALE,
  )

  if (wall.type === "water") {
    const material = flatMaterial(0xffffff, {map: waterTexture, transparent: true, opacity: 0.88})
    const water = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material)
    water.rotation.x = -Math.PI / 2
    water.position.y = 0.015
    group.add(water)
    return group
  }

  const height = wall.type === "fence" ? 0.9 : wall.type === "crates" ? 1.65 : wall.type === "tree" ? 2.8 : wall.type === "shipwreck" ? 1.9 : wall.type === "menhir" ? 1.45 : 2.15
  const color = propColors[wall.type] || 0x536060
  const block = STONE_PROP_TYPES.has(wall.type)
    ? new THREE.Mesh(
      createStoneBlockGeometry().scale(width, height, depth),
      new THREE.MeshStandardMaterial({color, roughness: .92, metalness: 0, flatShading: true, side: THREE.DoubleSide}),
    )
    : createColoredBox(width, height, depth, color)
  block.position.y = height / 2
  group.add(block, createContactShadow(Math.max(width, depth) * 0.55))
  return group
}
