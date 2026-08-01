import * as THREE from "three"
import {clone} from "three/addons/utils/SkeletonUtils.js"
import {WORLD_SCALE} from "../shared/coordinates.js"
import {createColoredBox, createContactShadow, flatMaterial} from "../shared/materials.js"
import {getEnvironmentPlacements} from "./environmentPlacement.js"

const propColors = {
  fence: 0x8b5436,
  crates: 0xb86f31,
  barrels: 0xa6463c,
  cactus: 0x2f9b52,
  crystal: 0x7653dc,
  bones: 0xe7d9b7,
  destructible: 0xd6854d,
  tree: 0x4f352b,
  dead_tree: 0x77736a,
  shipwreck: 0x6f4b35,
  altar_three_moons: 0x5079b4,
  sacrificial_stone: 0x8e394c,
  menhir: 0x626879,
}

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
  const color = propColors[wall.type] || (index % 5 === 0 ? 0x9853a8 : 0xd2764f)
  const block = createColoredBox(width, height, depth, color)
  block.position.y = height / 2
  group.add(block, createContactShadow(Math.max(width, depth) * 0.55))
  return group
}

export const createEnvironmentModel = (instance, wall) => {
  const group = new THREE.Group()
  getEnvironmentPlacements(wall, instance.asset, WORLD_SCALE).forEach((position, index) => {
    const model = index === 0 ? instance.root : clone(instance.root)
    model.position.x += position.x
    model.position.z += position.z
    group.add(model)
  })
  return {root: group, asset: instance.asset}
}
