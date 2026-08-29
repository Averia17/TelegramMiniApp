import * as THREE from "three"
import {createBushField} from "./BushRenderer.js"
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
  ruin_wall: 0x77766d,
  thorn_vine: 0x3f673f,
  fortress_wall: 0x59615f,
  building_wall: 0x6f706d,
  building_rubble: 0x82796d,
}
const STONE_PROP_TYPES = new Set(["wall", "destructible", "sacrificial_stone", "menhir", "fortress_wall"])
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

const createStoneCrack = (width, height, depth, side, variant = 0) => {
  const crack = new THREE.Shape()
  const offset = (variant % 3 - 1) * width * .12
  const startY = height * (.28 + (variant % 2) * .08)
  crack.moveTo(offset - width * .018, startY)
  crack.lineTo(offset + width * .012, startY + height * .12)
  crack.lineTo(offset - width * .008, startY + height * .23)
  crack.lineTo(offset + width * .032, startY + height * .34)
  crack.lineTo(offset + width * .012, startY + height * .43)
  crack.lineTo(offset - width * .026, startY + height * .34)
  crack.lineTo(offset - width * .045, startY + height * .22)
  crack.lineTo(offset - width * .028, startY + height * .11)
  crack.closePath()
  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(crack),
    standardMaterial(0x46504b, {
      roughness: 1,
      transparent: true,
      opacity: .74,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  )
  mesh.position.set(0, height / 2, side * (depth * .5 + .012))
  mesh.rotation.y = side < 0 ? Math.PI : 0
  mesh.userData.role = "stone-crack"
  mesh.castShadow = false
  mesh.receiveShadow = false
  return mesh
}

const createStoneDetailVisual = (width, height, depth, variant = 0) => {
  const group = new THREE.Group()
  group.add(createStoneCrack(width, height, depth, 1, variant))
  group.add(createStoneCrack(width, height, depth, -1, variant + 1))

  const chipMaterial = standardMaterial(variant % 2 ? 0x9ba79a : 0xaab09f, {roughness: .92})
  for (const [x, z, scale] of [
    [-.22, -.1, .72], [.18, .12, .55], [.04, .28, .42],
  ]) {
    const chip = addVisualPart(
      group,
      new THREE.TetrahedronGeometry(Math.min(width, depth) * .07 * scale, 0),
      chipMaterial,
      "stone-chip",
      new THREE.Vector3(x * width, height / 2 + height * .57, z * depth),
    )
    chip.rotation.set(.18 + variant * .07, x * 2.2, z * 1.4)
  }
  return group
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

const createBranchSegment = (group, start, end, radius, material, role) => {
  const direction = end.clone().sub(start)
  const branch = addVisualPart(
    group,
    new THREE.CylinderGeometry(radius * .72, radius, direction.length(), 6),
    material,
    role,
    start.clone().add(end).multiplyScalar(.5),
  )
  branch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
  return branch
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

const createRuinWallVisual = (width, height, depth, variant = 0) => {
  const group = new THREE.Group()
  const stone = [0x77766d, 0x858177, 0x6b706b][Math.abs(variant) % 3]
  const mortar = standardMaterial(0x4e574f, {roughness: 1})
  const moss = standardMaterial(0x54794a, {roughness: 1})
  const blockWidth = width * .31
  const blockDepth = depth * .72
  for (const [x, y, scale] of [
    [-.31, .2, .92], [0, .2, 1.08], [.31, .2, .84],
    [-.2, .54, .78], [.16, .54, 1.02], [0, .82, .64],
  ]) {
    const block = addVisualPart(
      group,
      new THREE.DodecahedronGeometry(1, 0),
      standardMaterial(stone, {roughness: .9}),
      "ruin-stone",
      new THREE.Vector3(x * width, y * height, 0),
    )
    block.scale.set(blockWidth * scale, height * .19 * scale, blockDepth * scale)
    block.rotation.y = (variant % 2 ? -.12 : .08) + x * .25
  }
  // A few cells carry a broken monumental pier. The distribution stays
  // deterministic, so adjacent ruin cells read as one authored structure
  // instead of identical repeated rocks.
  if (Math.abs(Math.floor(variant)) % 3 !== 1) {
    const pierMaterial = standardMaterial(stone === 0x77766d ? 0x686861 : 0x73736b, {roughness: .96})
    for (const [x, y, lean] of [[-.38, .46, -.08], [.38, .38, .1]]) {
      const pier = addVisualPart(
        group,
        new THREE.CylinderGeometry(width * .105, width * .15, height * .72, 6),
        pierMaterial,
        "ruin-pillar",
        new THREE.Vector3(x * width, y * height, depth * .08),
      )
      pier.rotation.z = lean
      pier.rotation.y = (variant % 2 ? -.12 : .1) + x
    }
  }
  const fallenCap = addVisualPart(
    group,
    new THREE.BoxGeometry(width * .54, height * .12, depth * .48),
    standardMaterial(variant % 2 ? 0x908d82 : 0x7d7e76, {roughness: .92}),
    "ruin-capstone",
    new THREE.Vector3((variant % 2 ? -.08 : .08) * width, height * .9, -depth * .04),
  )
  fallenCap.scale.set(width * .28, height * .1, depth * .34)
  fallenCap.rotation.set(.08, variant * .13, variant % 2 ? -.12 : .1)
  addVisualPart(group, new THREE.BoxGeometry(width * .9, height * .045, depth * .9), mortar, "ruin-foundation", new THREE.Vector3(0, height * .04, 0))
  const ivy = addVisualPart(group, new THREE.CylinderGeometry(width * .035, width * .05, height * .58, 6), moss, "ruin-ivy", new THREE.Vector3(width * .31, height * .42, depth * .4), new THREE.Vector3(.18, 0, -.22))
  ivy.scale.x = .7
  return group
}

const createThornVineVisual = (width, height, depth, variant = 0) => {
  const group = new THREE.Group()
  const shortSide = Math.min(width, depth)
  const vine = standardMaterial(variant % 2 ? 0x214b30 : 0x2d5b35, {roughness: 1})
  const vineLight = standardMaterial(variant % 3 === 0 ? 0x3f7540 : 0x396a3c, {roughness: .98})
  const leaf = standardMaterial(variant % 2 ? 0x4c873f : 0x3f7d3c, {roughness: 1})
  const leafLight = standardMaterial(0x65a34c, {roughness: 1})
  const thorn = standardMaterial(variant % 2 ? 0x59683a : 0x485934, {roughness: .96})
  const bloom = standardMaterial(variant % 2 ? 0xb85a4e : 0xc87359, {
    roughness: .82,
    emissive: 0x1d0805,
    emissiveIntensity: .08,
  })
  const bloomCore = standardMaterial(0xe2b45d, {roughness: .72})
  const radius = shortSide * .05

  const bed = addVisualPart(
    group,
    new THREE.CylinderGeometry(1, 1.08, .08, 12),
    standardMaterial(variant % 2 ? 0x3e733e : 0x477d42, {roughness: 1}),
    "thorn-vine-bed",
    new THREE.Vector3(0, height * .045, 0),
  )
  bed.scale.set(width * .48, height * .65, depth * .42)

  const rootSpecs = [
    [[-.06, .08, -.02], [-.34, .25, -.1]],
    [[.02, .08, .04], [.3, .24, .08]],
    [[-.02, .08, .12], [-.14, .26, .24]],
  ]
  rootSpecs.forEach(([from, to]) => {
    const start = new THREE.Vector3(from[0] * width, from[1] * height, from[2] * depth)
    const end = new THREE.Vector3(to[0] * width, to[1] * height, to[2] * depth)
    createBranchSegment(group, start, end, radius * 1.55, vine, "thorn-vine-root")
  })

  const branchSpecs = [
    [[-.36, .12, -.12], [-.28, .58, -.08], [-.08, 1.08, .02], [.16, 1.34, -.02]],
    [[-.1, .1, .1], [-.08, .56, .12], [.02, 1.08, .08], [.12, 1.46, .02]],
    [[.18, .11, -.06], [.28, .6, -.02], [.2, 1.04, .04], [-.02, 1.34, .1]],
    [[.06, .12, .18], [.36, .46, .2], [.44, .86, .16], [.32, 1.16, .1]],
    [[-.02, .12, .16], [-.26, .4, .22], [-.34, .78, .18], [-.26, 1.06, .12]],
  ]
  branchSpecs.forEach((points, index) => {
    const vectors = points.map(([x, y, z]) => new THREE.Vector3(x * width, y * height, z * depth))
    const material = index % 2 === variant % 2 ? vine : vineLight
    for (let segment = 0; segment < vectors.length - 1; segment++) {
      createBranchSegment(
        group,
        vectors[segment],
        vectors[segment + 1],
        radius * Math.max(.55, 1.08 - index * .08 - segment * .14),
        material,
        "thorn-vine-stem",
      )
    }
  })

  const hangingTendrils = [
    [[-.12, 1.28, .02], [-.38, 1.18, .05], [-.46, .86, .1], [-.3, .58, .12]],
    [[.16, 1.34, .04], [.4, 1.2, .1], [.48, .88, .08], [.34, .58, .1]],
    [[.04, 1.18, .16], [.24, .98, .22], [.16, .72, .22], [-.02, .52, .18]],
  ]
  hangingTendrils.forEach((points, index) => {
    const vectors = points.map(([x, y, z]) => new THREE.Vector3(x * width, y * height, z * depth))
    for (let segment = 0; segment < vectors.length - 1; segment++) {
      createBranchSegment(
        group,
        vectors[segment],
        vectors[segment + 1],
        radius * Math.max(.34, .7 - segment * .1),
        index % 2 ? vineLight : vine,
        "thorn-vine-tendril",
      )
    }
  })

  const leaves = [
    [-.3, .48, -.08, -.72, .9], [-.24, .78, -.04, .35, 1.05],
    [-.12, 1.08, .02, -.3, .88], [-.08, 1.34, .04, .72, .98],
    [.04, .55, .1, -.6, .92], [.02, .9, .08, .34, 1.08],
    [.12, 1.25, .04, -.42, 1.18], [.24, .48, -.04, .72, .86],
    [.28, .8, .02, -.6, .96], [.2, 1.12, .06, .34, 1.1],
    [.38, .7, .16, .72, .84], [.36, 1.02, .12, -.36, .8],
    [-.34, .68, .16, .46, .72], [.42, .52, .1, -.3, .7],
  ]
  leaves.forEach(([x, y, z, rotation, scale], index) => {
    const leafMesh = addVisualPart(
      group,
      new THREE.IcosahedronGeometry(shortSide * .095, 0),
      index % 3 === 0 ? leafLight : leaf,
      "thorn-vine-leaf",
      new THREE.Vector3(x * width, y * height, z * depth),
    )
    leafMesh.scale.set(scale * 1.25, .82, scale * .72)
    leafMesh.rotation.set(.08 + (index % 2) * .16, rotation, -.18 + index * .11)
  })

  const leafClusters = [
    [-.18, .7, -.02, .86], [.02, 1.02, .04, 1.04],
    [.2, .82, .02, .92], [.3, .58, .12, .72],
  ]
  leafClusters.forEach(([x, y, z, scale], clusterIndex) => {
    for (let petal = 0; petal < 2; petal++) {
      const angle = clusterIndex * .52 + petal * Math.PI
      const offset = shortSide * .07 * (petal ? 1 : -.72)
      const leafMesh = addVisualPart(
        group,
        new THREE.DodecahedronGeometry(shortSide * .075, 0),
        petal ? leaf : leafLight,
        "thorn-vine-leaf-cluster",
        new THREE.Vector3(x * width + Math.cos(angle) * offset, y * height, z * depth + Math.sin(angle) * offset),
      )
      leafMesh.scale.set(scale * 1.12, .55, scale * .5)
      leafMesh.rotation.set(.16, angle, -.2 + petal * .15)
    }
  })

  const createBloom = (x, y, z, scale, rotation) => {
    const flower = new THREE.Group()
    flower.position.set(x * width, y * height, z * depth)
    flower.rotation.y = rotation
    flower.userData.role = "thorn-vine-bloom"
    for (let petal = 0; petal < 4; petal++) {
      const angle = petal * Math.PI * .5
      const petalMesh = addVisualPart(
        flower,
        new THREE.IcosahedronGeometry(shortSide * .052 * scale, 0),
        bloom,
        "thorn-vine-petal",
        new THREE.Vector3(Math.cos(angle) * shortSide * .055 * scale, 0, Math.sin(angle) * shortSide * .055 * scale),
      )
      petalMesh.scale.set(1.25, .42, .72)
      petalMesh.rotation.y = angle
    }
    addVisualPart(
      flower,
      new THREE.SphereGeometry(shortSide * .034 * scale, 6, 4),
      bloomCore,
      "thorn-vine-bloom-core",
      new THREE.Vector3(0, shortSide * .018 * scale, 0),
    )
    group.add(flower)
  }

  createBloom(-.08, 1.34, .03, 1, .2)
  createBloom(.2, 1.12, .05, .78, -.24)
  createBloom(-.3, .9, .12, .68, .38)

  const thorns = [
    [[-.28, .54, -.04], [-.4, .62, -.08]], [[-.2, .86, .02], [-.08, .96, .04]],
    [[-.08, 1.18, .04], [.04, 1.28, .06]], [[.12, .58, .1], [.24, .66, .14]],
    [[.22, .94, .05], [.36, 1.02, .08]], [[.24, 1.22, .08], [.12, 1.3, .1]],
    [[.38, .72, .16], [.5, .76, .2]], [[-.04, .34, .11], [-.16, .4, .16]],
    [[-.3, 1.0, .12], [-.42, 1.04, .16]], [[.34, 1.06, .1], [.44, 1.14, .14]],
  ]
  thorns.forEach(([from, to]) => {
    const start = new THREE.Vector3(from[0] * width, from[1] * height, from[2] * depth)
    const end = new THREE.Vector3(to[0] * width, to[1] * height, to[2] * depth)
    const direction = end.clone().sub(start)
    const spike = addVisualPart(
      group,
      new THREE.ConeGeometry(radius * 1.35, direction.length() * 2.4, 5),
      thorn,
      "thorn-vine-spike",
      start.clone().add(end).multiplyScalar(.5),
    )
    spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
  })
  return group
}

// Soft overgrowth uses a separate, low silhouette from the thorn barricades.
// The broad leaves and exposed ground bed communicate “walkable slow terrain”
// at the same top-down scale where a tall thorn bundle reads as a wall.
const createVineClumpVisual = (width, height, depth, variant = 0) => {
  const group = new THREE.Group()
  const shortSide = Math.min(width, depth)
  const stem = standardMaterial(variant % 2 ? 0x416d37 : 0x355d32, {roughness: 1})
  const leaf = standardMaterial(variant % 2 ? 0x6d9f4b : 0x5d9144, {roughness: 1})
  const leafLight = standardMaterial(variant % 3 ? 0x8db95a : 0x79aa52, {roughness: .98})
  const bed = addVisualPart(
    group,
    new THREE.CylinderGeometry(1, 1.08, .08, 12),
    standardMaterial(variant % 2 ? 0x4f8747 : 0x5b914b, {roughness: 1}),
    "vine-bed",
    new THREE.Vector3(0, .035, 0),
  )
  bed.scale.set(width * .48, height * .45, depth * .44)

  const stemSpecs = [
    [[-.42, .08, -.16], [-.28, .32, -.1], [-.12, .56, -.02]],
    [[-.18, .08, .12], [-.06, .38, .1], [.12, .68, .04]],
    [[.16, .08, -.1], [.28, .3, -.02], [.34, .52, .12]],
    [[.4, .08, .14], [.32, .34, .18], [.16, .58, .12]],
    [[-.02, .08, .22], [-.26, .28, .25], [-.36, .48, .18]],
  ]
  stemSpecs.forEach((points, index) => {
    const vectors = points.map(([x, y, z]) => new THREE.Vector3(x * width, y * height, z * depth))
    for (let segment = 0; segment < vectors.length - 1; segment++) {
      createBranchSegment(group, vectors[segment], vectors[segment + 1], shortSide * (.035 - segment * .004), stem, "vine-stem")
    }
    const tip = vectors[vectors.length - 1]
    const leafMesh = addVisualPart(group, new THREE.IcosahedronGeometry(shortSide * .13, 0), index % 2 ? leaf : leafLight, "vine-leaf", tip.clone())
    leafMesh.scale.set(1.55, .62, .9)
    leafMesh.rotation.set(.12, index * .7, -.18 + index * .1)
  })

  const leafClusters = [
    [-.34, .28, -.12, .9], [-.18, .5, .02, 1.08], [.02, .3, .1, .88],
    [.2, .52, .04, 1.12], [.36, .28, .14, .82], [-.04, .68, .02, .9],
    [.28, .64, .12, .74],
  ]
  leafClusters.forEach(([x, y, z, scale], clusterIndex) => {
    for (let petal = 0; petal < 2; petal++) {
      const angle = clusterIndex * .58 + petal * Math.PI
      const offset = shortSide * .075 * (petal ? 1 : -.72)
      const leafMesh = addVisualPart(
        group,
        new THREE.DodecahedronGeometry(shortSide * .1, 0),
        petal ? leaf : leafLight,
        "vine-leaf-cluster",
        new THREE.Vector3(x * width + Math.cos(angle) * offset, y * height, z * depth + Math.sin(angle) * offset),
      )
      leafMesh.scale.set(scale * 1.35, .58, scale * .7)
      leafMesh.rotation.set(.16, angle, -.2 + petal * .15)
    }
  })
  group.userData.softTerrain = true
  return group
}

export const createVineField = (walls, palette = "default") => {
  const field = createBushField(walls, "vine", palette)
  field.name = "vine-field"
  field.userData.visualType = "vine"
  field.userData.softTerrain = true
  delete field.userData.bushWalls
  delete field.userData.bushTiles
  delete field.userData.bushOpacityMeshes
  return field
}

const createBuildingWallVisual = (width, height, depth, variant = 0) => {
  const group = new THREE.Group()
  const masonry = standardMaterial(variant % 2 ? 0x82786b : 0x746c62, {roughness: .98})
  const plaster = standardMaterial(variant % 2 ? 0x9a8c76 : 0x887c6d, {roughness: 1})
  const exposed = standardMaterial(variant % 3 ? 0x514439 : 0x624d3d, {roughness: .98})
  const glass = standardMaterial(0x202c2b, {roughness: .82, metalness: 0})
  const frame = standardMaterial(variant % 2 ? 0x4f392d : 0x634532, {roughness: .97, metalness: 0})

  // These cells are the collision footprint of a ruined house. Render them as
  // offset fragments rather than full squares: the collision remains a solid
  // tactical cover cell, while the eye still sees a broken, enterable ruin.
  addVisualPart(
    group,
    new THREE.BoxGeometry(width * .72, height * .32, depth * .28),
    masonry,
    "building-masonry",
    new THREE.Vector3(-width * .08, height * .16, -depth * .22),
  )
  addVisualPart(group, new THREE.BoxGeometry(width * .3, height * .44, depth * .42), exposed, "building-broken-cap", new THREE.Vector3(width * .25, height * .22, depth * .16))
  // The broken masonry is intentionally chunky: each ruin cell should read
  // as a collapsed wall at the battle camera distance, not as a scatter of
  // marble-sized stones. Keep the centres inside the cell so the larger
  // silhouette does not create an invisible visual overhang into the lane.
  for (const [x, z, size, y] of [
    [-.3, -.2, .29, .58], [.18, .16, .34, .64], [.34, -.24, .23, .52],
  ]) {
    const chunk = addVisualPart(group, new THREE.DodecahedronGeometry(Math.min(width, depth) * size, 0), plaster, "building-ruin-chunk", new THREE.Vector3(x * width, y * height, z * depth))
    chunk.scale.y = .62
    chunk.rotation.set(variant * .12 + x, variant * .2, z)
  }
  const windowX = (variant % 2 ? -.16 : .16) * width
  const windowY = height * .33
  const windowZ = depth * .48
  const windowWidth = width * .22
  const windowHeight = Math.max(.08, height * .14)
  addVisualPart(group, new THREE.BoxGeometry(windowWidth, windowHeight, .05), glass, "building-window", new THREE.Vector3(windowX, windowY, windowZ))
  for (const [x, y, w, h] of [
    [windowX, windowY - windowHeight / 2, windowWidth + .05, .025],
    [windowX, windowY + windowHeight / 2, windowWidth + .05, .025],
    [windowX - windowWidth / 2, windowY, .025, windowHeight],
    [windowX + windowWidth / 2, windowY, .025, windowHeight],
  ]) {
    addVisualPart(group, new THREE.BoxGeometry(w, h, .08), frame, "building-window-frame", new THREE.Vector3(x, y, windowZ + .02))
  }
  addVisualPart(group, new THREE.BoxGeometry(width * .26, height * .05, depth * .06), plaster, "building-plaster-patch", new THREE.Vector3(-width * .18, height * .36, depth * .49))
  const brokenBeam = addVisualPart(group, new THREE.BoxGeometry(width * .58, height * .045, depth * .07), frame, "building-timber", new THREE.Vector3(width * .08, height * .48, depth * .5))
  brokenBeam.rotation.z = variant % 2 ? -.18 : .12
  const brace = addVisualPart(group, new THREE.BoxGeometry(width * .045, height * .32, depth * .075), frame, "building-timber", new THREE.Vector3(-width * .12, height * .29, depth * .5))
  brace.rotation.z = variant % 2 ? .58 : -.58
  addVisualPart(group, new THREE.BoxGeometry(width * .1, height * .18, depth * .07), frame, "building-shutter", new THREE.Vector3(windowX - windowWidth * .62, windowY, windowZ + .035))
  const crack = addVisualPart(group, new THREE.BoxGeometry(width * .025, height * .32, .04), exposed, "building-crack", new THREE.Vector3(width * .25, height * .29, depth * .49))
  crack.rotation.z = variant % 2 ? -.2 : .16
  return group
}

const createBuildingRubbleVisual = (width, height, depth, variant = 0) => {
  const group = new THREE.Group()
  const concrete = standardMaterial(variant % 2 ? 0x91887c : 0x7e7d75, {roughness: 1})
  const concreteLight = standardMaterial(variant % 3 ? 0xa39a89 : 0xaaa18e, {roughness: .98})
  const mortar = standardMaterial(variant % 2 ? 0x5f6259 : 0x68685e, {roughness: 1})
  const timber = standardMaterial(variant % 2 ? 0x684735 : 0x513a2d, {roughness: .98})
  const timberLight = standardMaterial(variant % 2 ? 0x946342 : 0x85583c, {roughness: .96})

  // Rubble occupies a full collision cell, so its visual needs to read as a
  // collapsed piece of a house rather than three loose pebbles and a stray
  // line. A broad foundation keeps every detail grounded and makes the
  // footprint legible at the normal battle camera distance.
  const bed = addVisualPart(
    group,
    new THREE.BoxGeometry(width * .86, height * .07, depth * .78),
    mortar,
    "building-rubble-bed",
    new THREE.Vector3(-width * .02, height * .035, depth * .02),
    new THREE.Euler(0, variant % 2 ? -.08 : .1, 0),
  )
  bed.scale.y = .9

  const blocks = [
    [-.3, .19, -.18, .32, .3, .3, .08],
    [.03, .27, .05, .37, .36, .31, -.16],
    [.33, .17, -.22, .27, .26, .25, .2],
    [-.08, .43, .2, .29, .25, .28, -.3],
  ]
  blocks.forEach(([x, y, z, scaleX, scaleY, scaleZ, rotation], index) => {
    const block = addVisualPart(
      group,
      new THREE.DodecahedronGeometry(1, 0),
      index % 3 === 0 ? concreteLight : concrete,
      "building-rubble-block",
      new THREE.Vector3(x * width, y * height, z * depth),
    )
    block.scale.set(width * scaleX, height * scaleY, depth * scaleZ)
    block.rotation.set(variant * .12 + x, rotation + variant * .08, z * 1.4)
  })

  // Two substantial timber fragments cross the masonry and touch the pile;
  // they are deliberately thick enough to remain readable instead of
  // looking like unconnected decorative strokes.
  const beam = addVisualPart(
    group,
    new THREE.BoxGeometry(width * .68, height * .1, depth * .12),
    timber,
    "building-rubble-beam",
    new THREE.Vector3(width * .02, height * .57, -depth * .02),
    new THREE.Euler(.05, variant % 2 ? -.52 : .42, variant % 2 ? .08 : -.06),
  )
  beam.scale.y = .95
  addVisualPart(
    group,
    new THREE.BoxGeometry(width * .42, height * .075, depth * .1),
    timberLight,
    "building-rubble-beam",
    new THREE.Vector3(-width * .16, height * .72, depth * .12),
    new THREE.Euler(-.08, variant % 2 ? .3 : -.38, 0),
  )
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
  if (wall.type === "ruin_wall") return createRuinWallVisual(width, height, depth, variant)
  if (wall.type === "thorn_vine") return createThornVineVisual(width, height, depth, variant)
  if (wall.type === "vine") return createVineClumpVisual(width, height, depth, variant)
  if (wall.type === "building_wall") return createBuildingWallVisual(width, height, depth, variant)
  if (wall.type === "building_rubble") return createBuildingRubbleVisual(width, height, depth, variant)
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
  ruin_wall: 0x596156,
  thorn_vine: 0x456344,
  vine: 0x4f8248,
  fortress_wall: 0x4f5a54,
  building_wall: 0x5b635a,
  building_rubble: 0x66705d,
}

const createGroundingBed = (wall, width, depth, variant = 0) => {
  if (wall.type === "thorn_vine" || wall.type === "vine") {
    const group = new THREE.Group()
    group.name = "prop-grounding-bed"
    group.userData.role = "grounding-bed"
    const base = addVisualPart(
      group,
      new THREE.IcosahedronGeometry(1, 0),
      standardMaterial(wall.type === "vine" ? (variant % 2 ? 0x508b49 : 0x5d944e) : (variant % 2 ? 0x37693b : 0x416f3f), {
        roughness: 1,
        transparent: true,
        opacity: .55,
        depthWrite: false,
      }),
      "grounding-bed",
      new THREE.Vector3(0, .025, 0),
    )
    base.scale.set(width * .5, .035, depth * .46)
    base.castShadow = false
    base.receiveShadow = true
    return group
  }
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
  if (wall.type === "vine" || wall.type === "thorn_vine") group.userData.softTerrain = true
  group.position.set(
    (wall.minX + wall.maxX) * 0.5 * WORLD_SCALE,
    0,
    (wall.minY + wall.maxY) * 0.5 * WORLD_SCALE,
  )

  if (wall.type === "water" || wall.type === "pond") {
    const material = flatMaterial(0xffffff, {
      map: waterTexture,
      color: wall.type === "pond" ? 0x4a9da1 : 0xffffff,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
    const water = wall.type === "pond"
      ? new THREE.Mesh(new THREE.CircleGeometry(.5, 12), material)
      : new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material)
    if (wall.type === "pond") water.scale.set(width * 1.16, depth * 1.16, 1)
    water.rotation.x = -Math.PI / 2
    water.position.y = 0.015
    water.renderOrder = 1
    group.add(water)
    return group
  }

  const height = wall.type === "fence" ? 0.9 : wall.type === "thorn_vine" ? 2.05 : wall.type === "vine" ? 1.7 : wall.type === "crates" ? 1.65 : wall.type === "tree" ? 3.9 : wall.type === "dead_tree" ? 3.9 : wall.type === "shipwreck" ? 1.9 : wall.type === "menhir" ? 1.45 : wall.type === "ruin_wall" ? 3.25 : wall.type === "fortress_wall" ? 2.8 : wall.type === "building_wall" ? 1.15 : wall.type === "building_rubble" ? .8 : 2.15
  const block = STONE_PROP_TYPES.has(wall.type)
    ? new THREE.Mesh(
      createStoneBlockGeometry(index + wall.minX * 13 + wall.minY * 7).scale(width, height, depth),
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
  if (STONE_PROP_TYPES.has(wall.type)) {
    group.add(createStoneDetailVisual(width, height, depth, index + wall.minX * 13 + wall.minY * 7))
  }
  group.add(createContactShadow(Math.max(width, depth) * 0.55))
  group.add(createGroundingBed(wall, width, depth, index))
  return group
}
