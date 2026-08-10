import * as THREE from "three"
import {WORLD_SCALE} from "../shared/coordinates.js"
import {flatMaterial} from "../shared/materials.js"

export const BUSH_NEAR_RADIUS = 72
export const BUSH_FADE_RADIUS = 220
export const BUSH_NEAR_OPACITY = 0.58

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

const distanceToWall = (focus, wall) => {
  const dx = Math.max(wall.minX - focus.x, 0, focus.x - wall.maxX)
  const dy = Math.max(wall.minY - focus.y, 0, focus.y - wall.maxY)
  return Math.hypot(dx, dy)
}

export const getBushVisibilityOpacity = (
  focus,
  walls,
  nearRadius = BUSH_NEAR_RADIUS,
  fadeRadius = BUSH_FADE_RADIUS,
) => {
  if (!focus || !Array.isArray(walls) || !walls.length) return 1
  const distance = Math.min(...walls.map(wall => distanceToWall(focus, wall)))
  if (!Number.isFinite(distance) || distance <= nearRadius) return BUSH_NEAR_OPACITY
  const range = Math.max(1, fadeRadius - nearRadius)
  const progress = clamp((distance - nearRadius) / range, 0, 1)
  const eased = progress * progress * (3 - 2 * progress)
  return BUSH_NEAR_OPACITY + (1 - BUSH_NEAR_OPACITY) * eased
}

export const setBushVisibilityOpacity = (object, visibilityOpacity) => {
  if (!object?.traverse) return
  const visibility = clamp(Number(visibilityOpacity), BUSH_NEAR_OPACITY, 1)
  if (!Array.isArray(object.userData.bushMaterials)) {
    const materials = []
    object.traverse(node => {
      const nodeMaterials = Array.isArray(node.material) ? node.material : [node.material]
      nodeMaterials.forEach(material => {
        if (material && !materials.includes(material)) materials.push(material)
      })
    })
    object.userData.bushMaterials = materials
  }
  object.userData.bushMaterials.forEach(material => {
    material.userData = material.userData || {}
    if (material.userData.bushBaseOpacity == null) material.userData.bushBaseOpacity = material.opacity ?? 1
    if (material.userData.bushBaseDepthWrite == null) material.userData.bushBaseDepthWrite = material.depthWrite
    const opacity = material.userData.bushBaseOpacity * visibility
    material.transparent = opacity < .999 || material.userData.bushBaseOpacity < .999
    material.opacity = opacity
    material.depthWrite = opacity >= .999 ? material.userData.bushBaseDepthWrite : false
  })
  object.userData.currentBushOpacity = visibility
}

const withWhiteVertexColors = geometry => {
  const vertexColors = new Float32Array(geometry.attributes.position.count * 3)
  vertexColors.fill(1)
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(vertexColors, 3))
  return geometry
}

const createLeafClusterGeometry = () => {
  const leavesPerCluster = 6
  const positions = []
  const colors = []
  const indices = []
  const addVertex = (x, y, z, color) => {
    const index = positions.length / 3
    positions.push(x, y, z)
    colors.push(color.r, color.g, color.b)
    return index
  }
  const leafEdge = new THREE.Color(0.34, 0.68, 0.32)
  const leafMid = new THREE.Color(0.68, 0.91, 0.5)
  const leafRidge = new THREE.Color(0.96, 1, 0.72)
  const leafTip = new THREE.Color(0.52, 0.82, 0.38)
  const rotate = (x, z, angle) => [
    x * Math.cos(angle) - z * Math.sin(angle),
    x * Math.sin(angle) + z * Math.cos(angle),
  ]

  for (let index = 0; index < leavesPerCluster; index++) {
    const angle = index / leavesPerCluster * Math.PI * 2 + Math.sin(index * 2.7) * .09
    // Each blade rises from the ground instead of lying almost flat on it.
    // The raised ridge is what makes the field read as a volume that the
    // hero can enter, rather than a decal painted over the walkable floor.
    const points = [
      [0, .16, -.1, leafEdge],
      [-.27, .2, .1, leafMid],
      [0, .42, .14, leafRidge],
      [.27, .2, .1, leafMid],
      [-.4, .26, .36, leafEdge],
      [0, .72, .42, leafRidge],
      [.4, .26, .36, leafEdge],
      [-.14, .32, .7, leafEdge],
      [0, .56, .78, leafTip],
      [.14, .32, .7, leafEdge],
    ]
    const vertices = points.map(([x, y, z, color]) => {
      const [rotatedX, rotatedZ] = rotate(x, z, angle)
      return addVertex(rotatedX, y, rotatedZ, color)
    })
    const [root, leftNear, ridgeNear, rightNear, leftMid, ridgeMid, rightMid, leftTip, ridgeTip, rightTip] = vertices
    indices.push(
      root, leftNear, ridgeNear,
      root, ridgeNear, rightNear,
      leftNear, leftMid, ridgeMid,
      leftNear, ridgeMid, ridgeNear,
      rightNear, ridgeNear, ridgeMid,
      rightNear, ridgeMid, rightMid,
      leftMid, leftTip, ridgeTip,
      leftMid, ridgeTip, ridgeMid,
      rightMid, ridgeMid, ridgeTip,
      rightMid, ridgeTip, rightTip,
      leftTip, ridgeTip, rightTip,
    )
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.userData.bushLeafCluster = true
  return geometry
}

const createBushMaterial = (color, kind, lowQuality) => {
  const isMoonMist = kind === "moon_mist"
  const options = {
    vertexColors: true,
    transparent: true,
    opacity: isMoonMist ? .62 : 1,
    depthWrite: !isMoonMist,
    side: THREE.DoubleSide,
  }
  return lowQuality
    ? flatMaterial(color, options)
    : new THREE.MeshStandardMaterial({
      color,
      ...options,
      roughness: .92,
      metalness: 0,
      flatShading: true,
    })
}

const createInstanceColors = (mesh, walls, partsPerWall, palettes) => {
  const color = new THREE.Color()
  walls.forEach((_, index) => {
    for (let part = 0; part < partsPerWall; part++) {
      color.setHex(palettes[(index + part) % palettes.length])
      mesh.setColorAt(index * partsPerWall + part, color)
    }
  })
  mesh.instanceColor.needsUpdate = true
}

const hash = seed => {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return value - Math.floor(value)
}

const createLeafScatter = (wall, wallIndex, lowQuality) => {
  const width = Math.max(.85, (wall.maxX - wall.minX) * WORLD_SCALE)
  const depth = Math.max(.85, (wall.maxY - wall.minY) * WORLD_SCALE)
  const cellWidth = lowQuality ? .98 : .72
  const cellDepth = lowQuality ? .8 : .58
  const columns = Math.max(5, Math.ceil(width / cellWidth))
  const rows = Math.max(5, Math.ceil(depth / cellDepth))
  const leaves = []

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const seed = wallIndex * 7919 + row * 131 + column * 17
      const normalizedX = Math.max(.035, Math.min(.965, (column + hash(seed + 1)) / columns))
      const normalizedZ = Math.max(.05, Math.min(.95, (row + hash(seed + 2)) / rows))
      const size = (lowQuality ? .74 : .8) * (.82 + hash(seed + 3) * .34)
      leaves.push({
        x: wall.minX * WORLD_SCALE + normalizedX * width,
        z: wall.minY * WORLD_SCALE + normalizedZ * depth,
        size,
        rotation: hash(seed + 4) * Math.PI * 2,
        stretchX: .88 + hash(seed + 5) * .24,
        stretchZ: .88 + hash(seed + 6) * .24,
      })
    }
  }

  return leaves
}

const rangesTouchOrOverlap = (firstMin, firstMax, secondMin, secondMax) =>
  firstMax >= secondMin - 0.01 && secondMax >= firstMin - 0.01

const wallsTouch = (first, second) => {
  const horizontalEdge = Math.abs(first.maxX - second.minX) < 0.01 || Math.abs(second.maxX - first.minX) < 0.01
  const verticalEdge = Math.abs(first.maxY - second.minY) < 0.01 || Math.abs(second.maxY - first.minY) < 0.01
  const horizontalOverlap = rangesTouchOrOverlap(first.minX, first.maxX, second.minX, second.maxX)
  const verticalOverlap = rangesTouchOrOverlap(first.minY, first.maxY, second.minY, second.maxY)
  return (horizontalOverlap && verticalOverlap) ||
    (horizontalEdge && verticalOverlap) || (verticalEdge && horizontalOverlap)
}

const mergeAdjacentBushWalls = walls => {
  const merged = walls.map(wall => ({...wall}))
  let changed = true
  while (changed) {
    changed = false
    for (let firstIndex = 0; firstIndex < merged.length && !changed; firstIndex++) {
      for (let secondIndex = firstIndex + 1; secondIndex < merged.length; secondIndex++) {
        const first = merged[firstIndex]
        const second = merged[secondIndex]
        if (!wallsTouch(first, second)) continue
        merged[firstIndex] = {
          ...first,
          minX: Math.min(first.minX, second.minX),
          minY: Math.min(first.minY, second.minY),
          maxX: Math.max(first.maxX, second.maxX),
          maxY: Math.max(first.maxY, second.maxY),
        }
        merged.splice(secondIndex, 1)
        changed = true
        break
      }
    }
  }
  return merged
}

export const splitBushWallComponents = walls => {
  const remaining = Array.isArray(walls) ? walls.map(wall => ({...wall})) : []
  const components = []
  while (remaining.length) {
    const component = [remaining.shift()]
    let changed = true
    while (changed) {
      changed = false
      for (let index = remaining.length - 1; index >= 0; index--) {
        if (!component.some(wall => wallsTouch(wall, remaining[index]))) continue
        component.push(remaining[index])
        remaining.splice(index, 1)
        changed = true
      }
    }
    components.push(component)
  }
  return components
}

export const createBushField = (walls, kind = "bush", {lowQuality = false} = {}) => {
  const isMoonMist = kind === "moon_mist"
  const visualWalls = mergeAdjacentBushWalls(walls)
  const baseGeometry = withWhiteVertexColors(new THREE.SphereGeometry(1, lowQuality ? 12 : 16, lowQuality ? 6 : 8))
  const crownGeometry = createLeafClusterGeometry(lowQuality)
  const baseMaterial = createBushMaterial(isMoonMist ? 0x7795c8 : 0x3d9949, kind, lowQuality)
  const crownMaterial = createBushMaterial(0xffffff, kind, lowQuality)
  if (!isMoonMist) {
    baseMaterial.opacity = .16
    baseMaterial.depthWrite = false
  }
  const leaves = visualWalls.flatMap((wall, index) => createLeafScatter(wall, index, lowQuality))
  const base = new THREE.InstancedMesh(baseGeometry, baseMaterial, visualWalls.length)
  const crown = new THREE.InstancedMesh(crownGeometry, crownMaterial, leaves.length)
  base.name = "bush-field-base"
  crown.name = "bush-field-crown"

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const scale = new THREE.Vector3()
  const rotation = new THREE.Quaternion()
  const palettes = isMoonMist
    ? [0x7795c8, 0x9db9e8, 0xc2d5f7]
    : [0x5cb65f, 0x6ec76c, 0x4aa653, 0x3f9149]

  visualWalls.forEach((wall, index) => {
    const centerX = (wall.minX + wall.maxX) * .5 * WORLD_SCALE
    const centerZ = (wall.minY + wall.maxY) * .5 * WORLD_SCALE
    const width = Math.max(.85, (wall.maxX - wall.minX) * WORLD_SCALE)
    const depth = Math.max(.85, (wall.maxY - wall.minY) * WORLD_SCALE)

    position.set(centerX, .34, centerZ)
    rotation.identity()
    scale.set(width * .56, isMoonMist ? .28 : .42, depth * .56)
    matrix.compose(position, rotation, scale)
    base.setMatrixAt(index, matrix)

  })

  leaves.forEach((leaf, index) => {
    position.set(leaf.x, .46, leaf.z)
    rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), leaf.rotation)
    scale.set(leaf.size * leaf.stretchX, leaf.size * 1.42, leaf.size * leaf.stretchZ)
    matrix.compose(position, rotation, scale)
    crown.setMatrixAt(index, matrix)
  })

  base.instanceMatrix.needsUpdate = true
  crown.instanceMatrix.needsUpdate = true
  createInstanceColors(base, visualWalls, 1, isMoonMist ? [0x5f79b0, 0x6d88c0, 0x7795c8] : [0x347f43, 0x3d9949, 0x4eaa52])
  const color = new THREE.Color()
  leaves.forEach((_, index) => {
    color.setHex(palettes[index % palettes.length])
    crown.setColorAt(index, color)
  })
  crown.instanceColor.needsUpdate = true

  const field = new THREE.Group()
  field.name = "bush-field"
  field.add(base, crown)
  field.userData.role = "concealment-bush"
  field.userData.bushWalls = walls
  return field
}
