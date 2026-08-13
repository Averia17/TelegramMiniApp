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
  shipwreck: 0x53633d,
  altar_three_moons: 0x5079b4,
  sacrificial_stone: 0x8e394c,
  menhir: 0x626879,
}
const STONE_PROP_TYPES = new Set(["wall", "destructible", "sacrificial_stone", "menhir"])
const STONE_COLORS = [0x89958e, 0x829089, 0x929990, 0x788780]

const standardMaterial = (color, options = {}) => new THREE.MeshStandardMaterial({
  color,
  roughness: .78,
  metalness: .02,
  flatShading: true,
  ...options,
})

const addVisualPart = (group, geometry, material, role, position = null, rotation = null) => {
  const part = new THREE.Mesh(geometry, material)
  if (position) part.position.copy(position)
  if (rotation) part.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0)
  part.castShadow = true
  part.receiveShadow = true
  if (role) part.userData.role = role
  group.add(part)
  return part
}

const createLogPileVisual = (width, height, depth, variant = 0) => {
  const group = new THREE.Group()
  const shortSide = Math.min(width, depth)
  const bark = standardMaterial(variant % 3 === 0 ? 0x5d4935 : 0x66503a, {roughness: .98})
  const cut = standardMaterial(variant % 2 === 0 ? 0x9a8a65 : 0x8c805e, {roughness: 1})
  const moss = standardMaterial(variant % 2 === 0 ? 0x5c984b : 0x6aa955, {roughness: 1})

  addVisualPart(
    group,
    new THREE.CylinderGeometry(shortSide * .46, shortSide * .49, height * .08, 12),
    standardMaterial(0x466b45, {roughness: 1}),
    "log-pile-bed",
    new THREE.Vector3(0, height * .04, 0),
  )

  const mainAngle = variant % 2 === 0 ? -.16 : .2
  const logs = [
    [0, height * .24, -depth * .13, width * .76, shortSide * .13, mainAngle],
    [0, height * .46, depth * .1, width * .7, shortSide * .11, -mainAngle * .8],
    [width * .03, height * .67, -depth * .03, width * .61, shortSide * .095, mainAngle + .36],
  ]
  logs.forEach(([x, y, z, length, radius, angle]) => {
    createHorizontalRoot(
      group,
      length,
      radius,
      new THREE.Vector3(x, y, z),
      angle,
      bark,
      cut,
      "log-pile-log",
    )
  })

  for (const [x, y, z, scale] of [
    [-width * .25, height * .48, -depth * .2, 1.2],
    [width * .2, height * .7, depth * .13, .9],
  ]) {
    const clump = addVisualPart(
      group,
      new THREE.IcosahedronGeometry(shortSide * .095, 1),
      moss,
      "log-pile-moss",
      new THREE.Vector3(x, y, z),
    )
    clump.scale.set(scale, .52, .82)
  }
  return group
}

const createFenceVisual = (width, height, depth) => {
  const group = new THREE.Group()
  const wood = standardMaterial(0x825032, {roughness: .9})
  const postRadius = Math.min(width, depth) * .1
  for (const x of [-width * .34, width * .34]) {
    addVisualPart(group, new THREE.CylinderGeometry(postRadius * .82, postRadius, height, 6), wood, "fence-post", new THREE.Vector3(x, height / 2, 0))
  }
  for (const y of [height * .3, height * .67]) {
    addVisualPart(group, new THREE.BoxGeometry(width * .76, height * .12, depth * .14), wood, "fence-rail", new THREE.Vector3(0, y, 0))
  }
  return group
}

const createBarrelVisual = (width, height, depth) => {
  const group = new THREE.Group()
  const radius = Math.min(width, depth) * .47
  const body = standardMaterial(0x82462e, {roughness: .9})
  const ring = standardMaterial(0x443737, {roughness: .58, metalness: .25})
  addVisualPart(group, new THREE.CylinderGeometry(radius * .92, radius, height, 12), body, "barrel-body", new THREE.Vector3(0, height / 2, 0))
  for (const y of [height * .2, height * .5, height * .8]) {
    const hoop = addVisualPart(group, new THREE.TorusGeometry(radius * .94, Math.max(.025, radius * .055), 6, 16), ring, "barrel-hoop", new THREE.Vector3(0, y, 0))
    hoop.rotation.x = Math.PI / 2
  }
  return group
}

const createTreeVisual = (width, height, depth, dead = false) => {
  const group = new THREE.Group()
  const radius = Math.min(width, depth) * (dead ? .18 : .21)
  const trunkMaterial = standardMaterial(dead ? 0x5b4431 : 0x68472f, {roughness: .98})
  const trunk = addVisualPart(group, new THREE.CylinderGeometry(radius * .76, radius * (dead ? 1 : 1.08), height * (dead ? .72 : .66), 7), trunkMaterial, "tree-trunk", new THREE.Vector3(0, height * (dead ? .36 : .33), 0))
  if (dead) {
      trunk.rotation.z = -.1
      const branches = [
        {x: -.2, y: .38, z: -.02, length: .38, thick: .5, angle: -1.02, taper: .7},
        {x: .14, y: .5, z: .04, length: .3, thick: .38, angle: .56, taper: .58},
        {x: -.04, y: .6, z: -.1, length: .26, thick: .3, angle: -.34, taper: .5},
        {x: .06, y: .69, z: .02, length: .23, thick: .26, angle: .78, taper: .46},
        {x: -.01, y: .75, z: -.08, length: .17, thick: .2, angle: -.2, taper: .4},
      ]
      for (const branchSpec of branches) {
        const branch = addVisualPart(
          group,
          new THREE.CylinderGeometry(radius * branchSpec.thick * .58, radius * branchSpec.thick, height * branchSpec.length, 6),
          trunkMaterial,
          "dead-tree-branch",
          new THREE.Vector3(branchSpec.x * width, height * branchSpec.y, branchSpec.z * depth),
          new THREE.Vector3(0, 0, branchSpec.angle),
        )
        branch.scale.y = branchSpec.taper
      }
    return group
  }
  const foliage = standardMaterial(0x3e9b4a, {roughness: 1})
  addVisualPart(group, new THREE.IcosahedronGeometry(Math.min(width, depth) * .56, 1), foliage, "tree-crown", new THREE.Vector3(0, height * .72, 0))
  addVisualPart(group, new THREE.IcosahedronGeometry(Math.min(width, depth) * .38, 1), standardMaterial(0x62b85b, {roughness: 1}), "tree-crown", new THREE.Vector3(width * .24, height * .78, depth * .08))
  return group
}

const createHorizontalRoot = (group, length, radius, position, angle, bark, cut, role = "root-log") => {
  const direction = new THREE.Vector3(Math.cos(angle), .1, Math.sin(angle)).normalize()
  const log = addVisualPart(
    group,
    new THREE.CylinderGeometry(radius * .86, radius, length, 8, 1),
    bark,
    role,
    position,
  )
  log.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction)

  const endPosition = position.clone().addScaledVector(direction, length * .5)
  const end = addVisualPart(
    group,
    new THREE.CylinderGeometry(radius * .76, radius * .76, Math.max(.035, radius * .12), 8, 1),
    cut,
    "root-end",
    endPosition,
  )
  end.quaternion.copy(log.quaternion)
  return {direction, log}
}

const createRootClusterVisual = (width, height, depth, variant = 0) => {
  const group = new THREE.Group()
  const bark = standardMaterial(variant % 3 === 0 ? 0x4f5745 : 0x5b604b, {roughness: .98})
  const cut = standardMaterial(0x7b835c, {roughness: 1})
  const moss = standardMaterial(variant % 2 === 0 ? 0x4e9348 : 0x5da052, {roughness: 1})
  const mossLight = standardMaterial(0x78b85a, {roughness: 1})
  const shortSide = Math.min(width, depth)

  for (const [x, z, scale] of [
    [-.28, -.18, 1.05],
    [.18, .16, .9],
    [.34, -.08, .7],
  ]) {
    const mossBed = addVisualPart(
      group,
      new THREE.IcosahedronGeometry(shortSide * .2, 0),
      standardMaterial(variant % 2 === 0 ? 0x66804c : 0x718952, {roughness: 1}),
      "root-moss-bed",
      new THREE.Vector3(x * width, height * .055, z * depth),
    )
    mossBed.scale.set(scale, .22, .72)
  }

  const mainAngle = variant % 2 === 0 ? -.18 : .22
  const mainPosition = new THREE.Vector3(-width * .04, height * .26, -depth * .08)
  const main = createHorizontalRoot(group, shortSide * .82, shortSide * .12, mainPosition, mainAngle, bark, cut)
  const branchAngle = mainAngle + (variant % 3 === 0 ? 1.05 : -1.05)
  const branchPosition = new THREE.Vector3(width * .12, height * .24, depth * .08)
  createHorizontalRoot(group, shortSide * .66, shortSide * .095, branchPosition, branchAngle, bark, cut)
  createHorizontalRoot(
    group,
    shortSide * .52,
    shortSide * .08,
    new THREE.Vector3(-width * .12, height * .18, depth * .2),
    branchAngle + (variant % 2 === 0 ? -.72 : .72),
    bark,
    cut,
  )
  createHorizontalRoot(
    group,
    shortSide * .95,
    shortSide * .085,
    new THREE.Vector3(width * .04, height * .2, depth * .04),
    Math.PI / 2 + (variant % 2 === 0 ? -.12 : .12),
    bark,
    cut,
  )

  const mossA = addVisualPart(
    group,
    new THREE.IcosahedronGeometry(shortSide * .14, 1),
    moss,
    "moss-clump",
    new THREE.Vector3(-width * .2, height * .49, -depth * .12),
  )
  mossA.scale.set(1.35, .62, .9)
  const mossB = addVisualPart(
    group,
    new THREE.IcosahedronGeometry(shortSide * .12, 1),
    mossLight,
    "moss-clump",
    mainPosition.clone().addScaledVector(main.direction, shortSide * .18).setY(height * .54),
  )
  mossB.scale.set(1.1, .55, .82)
  const mossC = addVisualPart(
    group,
    new THREE.IcosahedronGeometry(shortSide * .09, 1),
    moss,
    "moss-clump",
    new THREE.Vector3(width * .29, height * .31, depth * .19),
  )
  mossC.scale.set(1.3, .55, .85)
  return group
}

const createCactusVisual = (width, height, depth) => {
  const group = new THREE.Group()
  const radius = Math.min(width, depth) * .17
  const green = standardMaterial(0x3e9c53, {roughness: .88})
  const moundRadius = Math.min(width, depth) * .47
  addVisualPart(
    group,
    new THREE.CylinderGeometry(moundRadius * .9, moundRadius, height * .1, 10),
    standardMaterial(0x8b643d, {roughness: 1}),
    "cactus-mound",
    new THREE.Vector3(0, height * .05, 0),
  )
  addVisualPart(group, new THREE.CylinderGeometry(radius, radius * 1.08, height * .8, 9), green, "cactus-body", new THREE.Vector3(0, height * .4, 0))
  for (const [x, y, z, rotation] of [[-.28, .42, 0, -.85], [.27, .58, 0, .85]]) {
    addVisualPart(group, new THREE.CylinderGeometry(radius * .7, radius * .82, height * .36, 8), green, "cactus-arm", new THREE.Vector3(x * width, y * height, z), new THREE.Vector3(0, 0, rotation))
  }
  return group
}

const createCrystalVisual = (width, height, depth) => {
  const group = new THREE.Group()
  const radius = Math.min(width, depth) * .23
  const crystal = standardMaterial(0x6f62c7, {roughness: .42, metalness: .08, emissive: 0x171035, emissiveIntensity: .32})
  const baseRadius = Math.min(width, depth) * .47
  addVisualPart(
    group,
    new THREE.CylinderGeometry(baseRadius * .88, baseRadius, height * .12, 12),
    standardMaterial(0x4d466c, {roughness: .9}),
    "crystal-base",
    new THREE.Vector3(0, height * .06, 0),
  )
  addVisualPart(group, new THREE.DodecahedronGeometry(radius, 0), crystal, "crystal", new THREE.Vector3(0, height * .42, 0))
  addVisualPart(group, new THREE.DodecahedronGeometry(radius * .62, 0), crystal.clone(), "crystal", new THREE.Vector3(radius * 1.2, height * .28, radius * .2), new THREE.Vector3(0, .3, -.25))
  return group
}

const createAltarVisual = (width, height) => {
  const group = new THREE.Group()
  const stone = standardMaterial(0x4e6b7d, {roughness: .82})
  const glow = new THREE.MeshBasicMaterial({color: 0x90d4ff, transparent: true, opacity: .42, depthWrite: false})
  addVisualPart(group, new THREE.CylinderGeometry(width * .42, width * .48, height * .3, 12), stone, "altar-base", new THREE.Vector3(0, height * .15, 0))
  addVisualPart(group, new THREE.CylinderGeometry(width * .24, width * .3, height * .5, 8), stone, "altar-pillar", new THREE.Vector3(0, height * .55, 0))
  const ring = addVisualPart(group, new THREE.TorusGeometry(width * .3, width * .035, 6, 20), glow, "altar-ring", new THREE.Vector3(0, height * .78, 0))
  ring.rotation.x = Math.PI / 2
  return group
}

const createDecorativeVisual = (wall, width, height, depth, variant = 0) => {
  if (wall.type === "crates") return createLogPileVisual(width, height, depth, variant)
  if (wall.type === "fence") return createFenceVisual(width, height, depth)
  if (wall.type === "barrels") return createBarrelVisual(width, height, depth)
  if (wall.type === "tree") return createTreeVisual(width, height, depth)
  if (wall.type === "dead_tree") return createTreeVisual(width, height, depth, true)
  if (wall.type === "shipwreck") return createRootClusterVisual(width, height, depth, variant)
  if (wall.type === "cactus") return createCactusVisual(width, height, depth)
  if (wall.type === "crystal") return createCrystalVisual(width, height, depth)
  if (wall.type === "altar_three_moons") return createAltarVisual(width, height)
  return createColoredBox(width, height, depth, propColors[wall.type] || 0x536060)
}

const groundingColors = {
  wall: 0x65715b,
  destructible: 0x66735a,
  tree: 0x526b45,
  dead_tree: 0x596248,
  crates: 0x4b6e45,
  shipwreck: 0x4b7045,
  altar_three_moons: 0x626c59,
  sacrificial_stone: 0x6d654b,
  menhir: 0x626c59,
}

const createGroundingBed = (wall, width, depth, variant = 0) => {
  if (wall.type === "shipwreck") {
    const bed = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1, 0),
      standardMaterial(groundingColors[wall.type] || 0x59694d, {
        roughness: 1,
        transparent: true,
        opacity: .42,
        depthWrite: false,
      }),
    )
    bed.name = "prop-grounding-bed"
    bed.userData.role = "grounding-bed"
    bed.position.y = .025
    bed.rotation.y = ((variant % 5) - 2) * .08
    bed.scale.set(width * .5, .035, depth * .5)
    bed.castShadow = false
    bed.receiveShadow = true
    return bed
  }
  const bed = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1.08, .045, 10),
    standardMaterial(groundingColors[wall.type] || 0x59694d, {
      roughness: 1,
      transparent: true,
      opacity: .48,
      depthWrite: false,
    }),
  )
  bed.name = "prop-grounding-bed"
  bed.userData.role = "grounding-bed"
  bed.position.y = .025
  bed.rotation.y = ((variant % 5) - 2) * .08
  bed.scale.set(width * .48, 1, depth * .48)
  bed.castShadow = false
  bed.receiveShadow = true
  return bed
}

export const createProp = (wall, index, waterTexture) => {
  const width = Math.max(2, wall.maxX - wall.minX) * WORLD_SCALE
  const depth = Math.max(2, wall.maxY - wall.minY) * WORLD_SCALE
  const group = new THREE.Group()
  group.userData.visualType = wall.type
  group.position.set(
    (wall.minX + wall.maxX) * 0.5 * WORLD_SCALE,
    0,
    (wall.minY + wall.maxY) * 0.5 * WORLD_SCALE,
  )

  if (wall.type === "water") {
    const material = flatMaterial(0xffffff, {
      map: waterTexture,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
    const water = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material)
    water.rotation.x = -Math.PI / 2
    water.position.y = 0.015
    water.renderOrder = 1
    group.add(water)
    return group
  }

  const height = wall.type === "fence" ? 0.9 : wall.type === "crates" ? 1.65 : wall.type === "tree" ? 3.9 : wall.type === "dead_tree" ? 3.9 : wall.type === "shipwreck" ? 1.9 : wall.type === "menhir" ? 1.45 : 2.15
  const block = STONE_PROP_TYPES.has(wall.type)
    ? new THREE.Mesh(
      createStoneBlockGeometry().scale(width, height, depth),
      new THREE.MeshStandardMaterial({
        color: STONE_COLORS[Math.abs(Math.floor(index + wall.minX / 40 * 13 + wall.minY / 40 * 7)) % STONE_COLORS.length],
        vertexColors: true,
        roughness: .84,
        metalness: 0,
        flatShading: true,
        side: THREE.DoubleSide,
      }),
    )
    : createDecorativeVisual(wall, width, height, depth, index + wall.minX * 13 + wall.minY * 7)
  if (STONE_PROP_TYPES.has(wall.type)) {
    block.position.y = height / 2
    block.castShadow = true
    block.receiveShadow = true
  } else {
    block.position.y = 0
  }
  group.add(block)
  group.add(createContactShadow(Math.max(width, depth) * 0.55))
  group.add(createGroundingBed(wall, width, depth, index))
  return group
}
