import * as THREE from "three"
import {WORLD_SCALE} from "../shared/coordinates.js"

const TILE_SIZE = 40
const UP = new THREE.Vector3(0, 1, 0)

const hashString = value => {
  let hash = 2166136261
  for (const character of String(value ?? "ground-cover")) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const hashCell = (x, y, seed) => {
  let value = Math.imul(x + 17, 0x45d9f3b) ^ Math.imul(y + 31, 0x119de1f3) ^ seed
  value = Math.imul(value ^ value >>> 16, 0x45d9f3b)
  return (value ^ value >>> 16) >>> 0
}

const occupiedCells = (walls, tileSize) => {
  const occupied = new Set()
  for (const wall of walls || []) {
    const minColumn = Math.floor(Number(wall.minX) / tileSize)
    const maxColumn = Math.ceil(Number(wall.maxX) / tileSize) - 1
    const minRow = Math.floor(Number(wall.minY) / tileSize)
    const maxRow = Math.ceil(Number(wall.maxY) / tileSize) - 1
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let column = minColumn; column <= maxColumn; column += 1) {
        occupied.add(`${column}:${row}`)
      }
    }
  }
  return occupied
}

const collectCoverCells = map => {
  const tileSize = Math.max(1, Number(map?.tileSize) || TILE_SIZE)
  const columns = Math.floor(Number(map?.width) / tileSize)
  const rows = Math.floor(Number(map?.height) / tileSize)
  const blocked = occupiedCells(map?.walls, tileSize)
  const seed = hashString(map?.seed ?? map?.id ?? map?.name)
  const cells = []

  for (let row = 1; row < rows - 1; row += 1) {
    for (let column = 1; column < columns - 1; column += 1) {
      if (blocked.has(`${column}:${row}`)) continue
      const value = hashCell(column, row, seed)
      // Sparse, deterministic dressing keeps lanes open and avoids visual noise.
      if (value % 10 === 0 || value % 37 === 0) {
        cells.push({x: column, y: row, value, vine: value % 37 === 0})
      }
    }
  }
  return cells
}

const createSegmentMatrix = (matrix, start, end, radius, y = .1) => {
  const direction = end.clone().sub(start)
  const length = direction.length()
  if (length <= .001) return false
  direction.normalize()
  const midpoint = start.clone().add(end).multiplyScalar(.5)
  midpoint.y = y
  matrix.compose(
    midpoint,
    new THREE.Quaternion().setFromUnitVectors(UP, direction),
    new THREE.Vector3(radius, length * .5, radius),
  )
  return true
}

const createGrassInstances = (cells, tileSize, seed) => {
  const instances = []
  cells.filter(cell => !cell.vine).forEach(cell => {
    const count = 2 + cell.value % 3
    for (let index = 0; index < count; index += 1) {
      const value = hashCell(cell.x * 7 + index, cell.y * 11 - index, seed)
      instances.push({
        x: (cell.x + .18 + ((value & 0xff) / 255) * .64) * tileSize * WORLD_SCALE,
        z: (cell.y + .18 + (((value >>> 8) & 0xff) / 255) * .64) * tileSize * WORLD_SCALE,
        scale: .72 + ((value >>> 16) & 0xff) / 255 * .42,
        rotation: ((value >>> 24) / 255) * Math.PI,
      })
    }
  })
  return instances
}

const createVineInstances = (cells, tileSize, seed) => {
  const stems = []
  const leaves = []
  cells.filter(cell => cell.vine).forEach((cell, index) => {
    const value = hashCell(cell.x * 13 + index, cell.y * 17 - index, seed)
    const start = new THREE.Vector3(
      (cell.x + .18 + ((value & 0xff) / 255) * .16) * tileSize * WORLD_SCALE,
      .1,
      (cell.y + .28 + (((value >>> 8) & 0xff) / 255) * .16) * tileSize * WORLD_SCALE,
    )
    const middle = start.clone().add(new THREE.Vector3(.18 + (value % 5) * .025, 0, .12))
    const end = middle.clone().add(new THREE.Vector3(.18, 0, -.1 - (value % 3) * .025))
    stems.push([start, middle], [middle, end])
    leaves.push(
      {position: middle, scale: .8 + (value % 4) * .08, rotation: value % 5},
      {position: end, scale: .68 + (value % 3) * .1, rotation: value % 7},
    )
  })
  return {stems, leaves}
}

export const createGroundCoverField = (map, theme = "team") => {
  const tileSize = Math.max(1, Number(map?.tileSize) || TILE_SIZE)
  const seed = hashString(map?.seed ?? map?.id ?? map?.name)
  const cells = collectCoverCells(map)
  const grassInstances = createGrassInstances(cells, tileSize, seed)
  const vineInstances = createVineInstances(cells, tileSize, seed)
  const field = new THREE.Group()
  field.name = "ground-cover-field"
  field.userData.role = "ground-cover-field"
  field.userData.decorativeOnly = true
  field.userData.coverCells = cells.map(({x, y}) => ({x, y}))

  const grass = new THREE.InstancedMesh(
    new THREE.ConeGeometry(.055, .34, 4),
    new THREE.MeshBasicMaterial({color: theme === "team" ? 0x8b9d5a : 0x6d9b52}),
    Math.max(1, grassInstances.length),
  )
  grass.name = "ground-cover-grass"
  grass.userData.role = "ground-cover-grass"
  grass.renderOrder = 3
  grass.visible = grassInstances.length > 0

  const vineStems = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(.032, .045, 1, 5),
    new THREE.MeshBasicMaterial({color: theme === "team" ? 0x6d9148 : 0x4e873f}),
    Math.max(1, vineInstances.stems.length),
  )
  vineStems.name = "ground-cover-vine-stems"
  vineStems.userData.role = "ground-cover-vine"
  vineStems.renderOrder = 4
  vineStems.visible = vineInstances.stems.length > 0

  const vineLeaves = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(.075, 0),
    new THREE.MeshBasicMaterial({color: theme === "team" ? 0x9bab54 : 0x71a94b}),
    Math.max(1, vineInstances.leaves.length),
  )
  vineLeaves.name = "ground-cover-vine-leaves"
  vineLeaves.userData.role = "ground-cover-vine"
  vineLeaves.renderOrder = 5
  vineLeaves.visible = vineInstances.leaves.length > 0

  const matrix = new THREE.Matrix4()
  grassInstances.forEach((instance, index) => {
    matrix.compose(
      new THREE.Vector3(instance.x, .17 * instance.scale, instance.z),
      new THREE.Quaternion().setFromAxisAngle(UP, instance.rotation),
      new THREE.Vector3(instance.scale, instance.scale, instance.scale),
    )
    grass.setMatrixAt(index, matrix)
  })
  vineInstances.stems.forEach(([start, end], index) => {
    createSegmentMatrix(matrix, start, end, .032)
    vineStems.setMatrixAt(index, matrix)
  })
  vineInstances.leaves.forEach((leaf, index) => {
    matrix.compose(
      new THREE.Vector3(leaf.position.x, .13, leaf.position.z),
      new THREE.Quaternion().setFromAxisAngle(UP, leaf.rotation),
      new THREE.Vector3(leaf.scale * 1.25, leaf.scale * .45, leaf.scale * .8),
    )
    vineLeaves.setMatrixAt(index, matrix)
  })
  grass.instanceMatrix.needsUpdate = true
  vineStems.instanceMatrix.needsUpdate = true
  vineLeaves.instanceMatrix.needsUpdate = true
  field.add(grass, vineStems, vineLeaves)
  return field
}
