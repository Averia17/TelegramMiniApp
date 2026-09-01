import * as THREE from "three"
import {WORLD_SCALE} from "../shared/coordinates.js"
import {flatMaterial} from "../shared/materials.js"

export const BUSH_NEAR_RADIUS = 24
export const BUSH_FADE_RADIUS = 72
export const BUSH_NEAR_OPACITY = 0.58
export const BUSH_CLUSTER_NEAR_RADIUS = 8
export const BUSH_CLUSTER_FADE_RADIUS = 26
export const BUSH_TILE_SIZE = 40
// Concealment changes over a broad world-space fade range. Recomputing every
// instanced opacity attribute for sub-pixel focus movement only creates buffer
// uploads without a visible change, so keep one shared epsilon for the field
// and map-level caches.
export const BUSH_VISIBILITY_FOCUS_EPSILON = 1.5

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

const distanceToWall = (focus, wall) => {
  const dx = Math.max(wall.minX - focus.x, 0, focus.x - wall.maxX)
  const dy = Math.max(wall.minY - focus.y, 0, focus.y - wall.maxY)
  return Math.hypot(dx, dy)
}

const visibilityFromDistance = (distance, nearRadius, fadeRadius) => {
  if (!Number.isFinite(distance) || distance <= nearRadius) return BUSH_NEAR_OPACITY
  const range = Math.max(1, fadeRadius - nearRadius)
  const progress = clamp((distance - nearRadius) / range, 0, 1)
  const eased = progress * progress * (3 - 2 * progress)
  return BUSH_NEAR_OPACITY + (1 - BUSH_NEAR_OPACITY) * eased
}

export const getBushVisibilityOpacity = (
  focus,
  walls,
  nearRadius = BUSH_NEAR_RADIUS,
  fadeRadius = BUSH_FADE_RADIUS,
) => {
  if (!focus || !Array.isArray(walls) || !walls.length) return 1
  const distance = Math.min(...walls.map(wall => distanceToWall(focus, wall)))
  return visibilityFromDistance(distance, nearRadius, fadeRadius)
}

export const getBushTileVisibilityOpacity = (
  focus,
  tile,
  nearRadius = BUSH_NEAR_RADIUS,
  fadeRadius = BUSH_FADE_RADIUS,
) => {
  if (!focus || !tile) return 1
  const insideTile = focus.x >= tile.minX && focus.x <= tile.maxX &&
    focus.y >= tile.minY && focus.y <= tile.maxY
  if (insideTile) return BUSH_NEAR_OPACITY
  const centerX = (tile.minX + tile.maxX) * .5
  const centerY = (tile.minY + tile.maxY) * .5
  return visibilityFromDistance(Math.hypot(focus.x - centerX, focus.y - centerY), nearRadius, fadeRadius)
}

export const getBushClusterVisibilityOpacity = (
  focus,
  position,
  nearRadius = BUSH_CLUSTER_NEAR_RADIUS,
  fadeRadius = BUSH_CLUSTER_FADE_RADIUS,
) => {
  if (!focus || !position || !Number.isFinite(Number(focus.x)) || !Number.isFinite(Number(focus.y)) ||
    !Number.isFinite(Number(position.x)) || !Number.isFinite(Number(position.y))) return 1
  return visibilityFromDistance(
    Math.hypot(Number(focus.x) - Number(position.x), Number(focus.y) - Number(position.y)),
    nearRadius,
    fadeRadius,
  )
}

export const setBushVisibilityOpacity = (object, visibilityOpacity, focus = null) => {
  if (!object?.traverse) return
  const visibility = clamp(Number(visibilityOpacity), BUSH_NEAR_OPACITY, 1)
  const tiles = Array.isArray(object.userData.bushTiles) ? object.userData.bushTiles : []
  const opacityMeshes = object.userData.bushOpacityMeshes || []
  if (!opacityMeshes.length) {
    object.traverse(node => {
      if (node.userData?.bushOpacityAttribute) opacityMeshes.push(node)
    })
    object.userData.bushOpacityMeshes = opacityMeshes
  }
  const hasFocus = Number.isFinite(Number(focus?.x)) && Number.isFinite(Number(focus?.y))
  const previousFocus = object.userData.bushVisibilityFocus
  if (previousFocus && hasFocus && Math.hypot(
    Number(focus.x) - previousFocus.x,
    Number(focus.y) - previousFocus.y,
  ) < BUSH_VISIBILITY_FOCUS_EPSILON) return
  if (previousFocus && !hasFocus && previousFocus.x === null && visibility === object.userData.currentBushOpacity) return
  if (tiles.length && opacityMeshes.length) {
    const tileOpacities = tiles.map(tile => hasFocus
      ? getBushTileVisibilityOpacity(focus, tile)
      : visibility)
    let currentOpacity = 1
    opacityMeshes.forEach(mesh => {
      const attribute = mesh.userData.bushOpacityAttribute
      const tileIndices = mesh.userData.bushTileIndices || []
      const visibilityPositions = mesh.userData.bushVisibilityPositions
      let changed = false
      for (let index = 0; index < attribute.count; index += 1) {
        const tileIndex = tileIndices[index] ?? index
        const opacity = hasFocus && Array.isArray(visibilityPositions) && visibilityPositions[index]
          ? getBushClusterVisibilityOpacity(focus, visibilityPositions[index])
          : tileOpacities[tileIndex] ?? visibility
        if (attribute.getX(index) !== opacity) {
          attribute.setX(index, opacity)
          changed = true
        }
        currentOpacity = Math.min(currentOpacity, opacity)
      }
      if (changed) attribute.needsUpdate = true
    })
    object.userData.currentBushOpacity = currentOpacity
    object.userData.bushVisibilityFocus = hasFocus ? {x: Number(focus.x), y: Number(focus.y)} : {x: null, y: null}
    return
  }
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
  object.userData.bushVisibilityFocus = hasFocus ? {x: Number(focus.x), y: Number(focus.y)} : {x: null, y: null}
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

const addBushTileOpacityShader = (material, opacityExponent = 3) => {
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float instanceOpacity;\nvarying float vInstanceOpacity;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvInstanceOpacity = instanceOpacity;",
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying float vInstanceOpacity;",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>\ndiffuseColor.a *= pow(vInstanceOpacity, ${Number(opacityExponent).toFixed(2)});`,
      )
  }
  material.customProgramCacheKey = () => `bush-tile-opacity-v${Number(opacityExponent).toFixed(2)}`
  return material
}

const createBushMaterial = (color, kind) => {
  const isMoonMist = kind === "moon_mist"
  const options = {
    vertexColors: true,
    transparent: true,
    opacity: isMoonMist ? .62 : 1,
    depthWrite: !isMoonMist,
    side: THREE.DoubleSide,
  }
  return addBushTileOpacityShader(flatMaterial(color, options), 1.65)
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

const createInstanceOpacity = (mesh, tileIndices, visibilityPositions = null) => {
  const attribute = new THREE.InstancedBufferAttribute(new Float32Array(mesh.count).fill(1), 1)
  mesh.geometry.setAttribute("instanceOpacity", attribute)
  mesh.userData.bushOpacityAttribute = attribute
  mesh.userData.bushTileIndices = tileIndices
  if (Array.isArray(visibilityPositions)) mesh.userData.bushVisibilityPositions = visibilityPositions
}

const hash = seed => {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return value - Math.floor(value)
}

const createLeafScatter = (wall, wallIndex, sizeMultiplier = 1) => {
  const width = Math.max(.85, (wall.maxX - wall.minX) * WORLD_SCALE)
  const depth = Math.max(.85, (wall.maxY - wall.minY) * WORLD_SCALE)
  const cellWidth = .72
  const cellDepth = .58
  const columns = Math.max(5, Math.ceil(width / cellWidth))
  const rows = Math.max(5, Math.ceil(depth / cellDepth))
  const leaves = []

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const seed = wallIndex * 7919 + row * 131 + column * 17
      const normalizedX = Math.max(.035, Math.min(.965, (column + hash(seed + 1)) / columns))
      const normalizedZ = Math.max(.05, Math.min(.95, (row + hash(seed + 2)) / rows))
      const size = .8 * sizeMultiplier * (.82 + hash(seed + 3) * .34)
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

export const subdivideBushWalls = (walls, tileSize = BUSH_TILE_SIZE) => {
  const size = Math.max(1, Number(tileSize) || BUSH_TILE_SIZE)
  const tiles = new Map()
  ;(Array.isArray(walls) ? walls : []).forEach(wall => {
    const minX = Number(wall.minX)
    const minY = Number(wall.minY)
    const maxX = Number(wall.maxX)
    const maxY = Number(wall.maxY)
    if (![minX, minY, maxX, maxY].every(Number.isFinite) || maxX <= minX || maxY <= minY) return
    const columns = Math.max(1, Math.ceil((maxX - minX) / size - 1e-9))
    const rows = Math.max(1, Math.ceil((maxY - minY) / size - 1e-9))
    for (let column = 0; column < columns; column += 1) {
      for (let row = 0; row < rows; row += 1) {
        const tileMinX = minX + column * size
        const tileMinY = minY + row * size
        const key = `${tileMinX}:${tileMinY}:${wall.type || "bush"}`
        if (tiles.has(key)) continue
        tiles.set(key, {
          ...wall,
          minX: tileMinX,
          minY: tileMinY,
          maxX: tileMinX + size,
          maxY: tileMinY + size,
        })
      }
    }
  })
  return [...tiles.values()]
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

export const createBushField = (walls, kind = "bush", palette = "default") => {
  const isMoonMist = kind === "moon_mist"
  const isVine = kind === "vine"
  const isTeam = palette === "team"
  const visualWalls = subdivideBushWalls(walls)
  // Keep the support volume aligned to the gameplay tile. A sphere creates
  // large circular patches when several transparent instances overlap.
  const baseGeometry = withWhiteVertexColors(new THREE.BoxGeometry(1, 1, 1))
  const crownGeometry = createLeafClusterGeometry()
  // The instance palette carries the foliage tint. A white material avoids
  // multiplying that palette by a second green and producing dark patches.
  const baseMaterial = createBushMaterial(0xffffff, kind)
  const crownMaterial = createBushMaterial(0xffffff, kind)
  const foregroundMaterial = addBushTileOpacityShader(flatMaterial(0xffffff, {
    vertexColors: true,
    transparent: true,
    opacity: isMoonMist ? .28 : .78,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), 1.25)
  const bedMaterial = createBushMaterial(0xffffff, kind)
  bedMaterial.opacity = isMoonMist ? .16 : .24
  bedMaterial.depthWrite = false
  foregroundMaterial.opacity = isMoonMist ? .28 : .78
  foregroundMaterial.depthWrite = false
  if (!isMoonMist) {
    // The support volume is foliage, not a baked shadow. Keep it close to
    // the ground palette so it does not create a dark halo around every bush.
    baseMaterial.opacity = .92
    baseMaterial.depthWrite = false
  }
  const leaves = visualWalls.flatMap((wall, index) => createLeafScatter(wall, index, isVine ? 1.12 : 1)
    .map(leaf => ({...leaf, tileIndex: index})))
  // Keep a sparse set of blades in front of the hero. The full canopy is
  // rendered behind the actor so the brawler reads as standing inside it,
  // while this small layer preserves the occlusion cue at the silhouette.
  const foregroundLeaves = visualWalls.flatMap((wall, tileIndex) => {
    const width = Math.max(.85, (wall.maxX - wall.minX) * WORLD_SCALE)
    // The battle camera is placed on the +Z side of the map. Keep this
    // sparse fringe just beyond the near edge so it can actually overlap the
    // hero's lower silhouette instead of being depth-tested behind it.
    const frontZ = wall.maxY * WORLD_SCALE + .34
    return [.14, .32, .5, .68, .86].map((normalizedX, index) => ({
      x: wall.minX * WORLD_SCALE + (normalizedX + (hash(tileIndex * 67 + index + 17) - .5) * .06) * width,
      z: frontZ + .04 + hash(tileIndex * 71 + index * 19) * .36,
      size: (isVine ? .96 : .86) + hash(tileIndex * 31 + index) * .2,
      rotation: hash(tileIndex * 43 + index + 7) * Math.PI * 2,
      stretchX: .9 + hash(tileIndex * 53 + index + 11) * .2,
      stretchZ: .88 + hash(tileIndex * 61 + index + 13) * .2,
      tileIndex,
    }))
  })
  // The bed is a tile footprint, not a radial decal. A circle here reads as
  // a large mysterious ring whenever the player stands inside a field.
  const bed = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), bedMaterial, visualWalls.length)
  const base = new THREE.InstancedMesh(baseGeometry, baseMaterial, visualWalls.length)
  const crown = new THREE.InstancedMesh(crownGeometry, crownMaterial, leaves.length)
  const foreground = new THREE.InstancedMesh(crownGeometry.clone(), foregroundMaterial, foregroundLeaves.length)
  bed.name = "bush-field-bed"
  base.name = "bush-field-base"
  crown.name = "bush-field-crown"
  foreground.name = "bush-field-foreground"
  bed.rotation.x = -Math.PI / 2
  bed.castShadow = false
  bed.receiveShadow = false
  base.castShadow = false
  base.receiveShadow = false
  crown.castShadow = false
  crown.receiveShadow = false
  foreground.castShadow = false
  foreground.receiveShadow = false
  bed.renderOrder = 4
  base.renderOrder = -2
  crown.renderOrder = -1
  foreground.renderOrder = 12
  createInstanceOpacity(bed, visualWalls.map((_, index) => index))
  createInstanceOpacity(base, visualWalls.map((_, index) => index))
  createInstanceOpacity(
    crown,
    leaves.map(leaf => leaf.tileIndex),
    leaves.map(leaf => ({x: leaf.x / WORLD_SCALE, y: leaf.z / WORLD_SCALE})),
  )
  createInstanceOpacity(
    foreground,
    foregroundLeaves.map(leaf => leaf.tileIndex),
    foregroundLeaves.map(leaf => ({x: leaf.x / WORLD_SCALE, y: leaf.z / WORLD_SCALE})),
  )

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const scale = new THREE.Vector3()
  const rotation = new THREE.Quaternion()
  const palettes = isMoonMist
    ? [0x7795c8, 0x9db9e8, 0xc2d5f7]
    : isTeam
      ? [0x3b6445, 0x4a7650, 0x2f573d, 0x587552]
      : [0x5cb65f, 0x6ec76c, 0x4aa653, 0x3f9149]

  visualWalls.forEach((wall, index) => {
    const centerX = (wall.minX + wall.maxX) * .5 * WORLD_SCALE
    const centerZ = (wall.minY + wall.maxY) * .5 * WORLD_SCALE
    const width = Math.max(.85, (wall.maxX - wall.minX) * WORLD_SCALE)
    const depth = Math.max(.85, (wall.maxY - wall.minY) * WORLD_SCALE)

    position.set(centerX, .018, centerZ)
    rotation.identity()
    scale.set(width * (isVine ? .74 : .62), depth * (isVine ? .74 : .62), 1)
    matrix.compose(position, rotation, scale)
    bed.setMatrixAt(index, matrix)

    position.set(centerX, .34, centerZ)
    scale.set(width * (isVine ? .58 : .52), isMoonMist ? .28 : (isVine ? .18 : .14), depth * (isVine ? .58 : .52))
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
  foregroundLeaves.forEach((leaf, index) => {
    position.set(leaf.x, .34, leaf.z)
    rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), leaf.rotation)
    scale.set(leaf.size * leaf.stretchX, leaf.size * 1.9, leaf.size * leaf.stretchZ)
    matrix.compose(position, rotation, scale)
    foreground.setMatrixAt(index, matrix)
  })

  bed.instanceMatrix.needsUpdate = true
  base.instanceMatrix.needsUpdate = true
  crown.instanceMatrix.needsUpdate = true
  foreground.instanceMatrix.needsUpdate = true
  createInstanceColors(
    bed,
    visualWalls,
    1,
    isMoonMist
      ? [0x5269a2, 0x617bb8]
      : isTeam
        ? [0x263f31, 0x2f4d37, 0x3b5940]
        : [0x347d42, 0x438e47, 0x2f713b],
  )
  createInstanceColors(
    base,
    visualWalls,
    1,
    isMoonMist
      ? [0x5f79b0, 0x6d88c0, 0x7795c8]
      : isTeam
        ? [0x2e4b35, 0x385c3f, 0x456548]
        : [0x347f43, 0x3d9949, 0x4eaa52],
  )
  const color = new THREE.Color()
  leaves.forEach((_, index) => {
    color.setHex(palettes[index % palettes.length])
    crown.setColorAt(index, color)
  })
  crown.instanceColor.needsUpdate = true
  foregroundLeaves.forEach((_, index) => {
    color.setHex(palettes[(index * 3 + 1) % palettes.length])
    foreground.setColorAt(index, color)
  })
  foreground.instanceColor.needsUpdate = true

  const field = new THREE.Group()
  field.name = "bush-field"
  field.add(bed, base, crown, foreground)
  field.userData.role = "concealment-bush"
  field.userData.bushWalls = walls
  field.userData.bushTiles = visualWalls
  field.userData.bushOpacityMeshes = [bed, base, crown, foreground]
  return field
}
