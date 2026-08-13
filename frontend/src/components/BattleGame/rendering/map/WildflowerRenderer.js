import * as THREE from "three"
import {WORLD_SCALE} from "../shared/coordinates.js"

const FLOWER_COLORS = [0xffdf63, 0xf6f1dc, 0xeaa2c8, 0xaacdf2, 0xd8b2ef]

const hashCell = (x, y, seed) => {
  let value = Math.imul(x + 17, 0x45d9f3b) ^ Math.imul(y + 31, 0x119de1f3) ^ (Number(seed) || 0)
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
    for (let row = minRow; row <= maxRow; row++) {
      for (let column = minColumn; column <= maxColumn; column++) {
        occupied.add(`${column}:${row}`)
      }
    }
  }
  return occupied
}

const collectFlowerPositions = map => {
  const tileSize = Math.max(1, Number(map?.tileSize) || 40)
  const columns = Math.floor(Number(map?.width) / tileSize)
  const rows = Math.floor(Number(map?.height) / tileSize)
  const blocked = occupiedCells(map?.walls, tileSize)
  const positions = []

  for (let row = 1; row < rows - 1; row++) {
    for (let column = 1; column < columns - 1; column++) {
      if (blocked.has(`${column}:${row}`)) continue
      const hash = hashCell(column, row, map?.seed)
      if (hash % 9 > 1) continue
      const flowersInPatch = hash % 3 + 2
      for (let index = 0; index < flowersInPatch; index++) {
        const flowerHash = hashCell(column * 7 + index, row * 11 - index, hash)
        const jitterX = ((flowerHash & 0xff) / 255 - .5) * tileSize * .68
        const jitterY = (((flowerHash >>> 8) & 0xff) / 255 - .5) * tileSize * .68
        positions.push({
          x: (column + .5) * tileSize + jitterX,
          y: (row + .5) * tileSize + jitterY,
          scale: .78 + ((flowerHash >>> 16) & 0xff) / 255 * .45,
          color: FLOWER_COLORS[(flowerHash >>> 24) % FLOWER_COLORS.length],
        })
      }
    }
  }
  return positions
}

export const createWildflowerField = map => {
  const positions = collectFlowerPositions(map)
  const field = new THREE.Group()
  field.name = "wildflower-field"
  field.userData.role = "wildflower-field"
  field.userData.flowerPositions = positions

  const stems = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(.035, .05, .42, 5),
    new THREE.MeshBasicMaterial({color: 0x3f7f3d}),
    positions.length,
  )
  stems.name = "wildflower-stems"
  stems.castShadow = false
  stems.receiveShadow = false

  const bloomGeometry = new THREE.CircleGeometry(.2, 5)
  bloomGeometry.rotateX(-Math.PI / 2)
  const blooms = new THREE.InstancedMesh(
    bloomGeometry,
    new THREE.MeshBasicMaterial({side: THREE.DoubleSide, toneMapped: false}),
    positions.length,
  )
  blooms.name = "wildflower-blooms"
  blooms.castShadow = false
  blooms.receiveShadow = false

  const centres = new THREE.InstancedMesh(
    new THREE.SphereGeometry(.065, 6, 4),
    new THREE.MeshBasicMaterial({color: 0xffd24c, toneMapped: false}),
    positions.length,
  )
  centres.name = "wildflower-centres"
  centres.castShadow = false
  centres.receiveShadow = false

  const matrix = new THREE.Matrix4()
  const rotation = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  const scenePosition = new THREE.Vector3()
  positions.forEach((flower, index) => {
    const height = flower.scale
    scale.setScalar(flower.scale)
    scenePosition.set(flower.x * WORLD_SCALE, .21 * height, flower.y * WORLD_SCALE)
    matrix.compose(scenePosition, rotation, scale)
    stems.setMatrixAt(index, matrix)

    scenePosition.y = .46 * height
    matrix.compose(scenePosition, rotation, scale)
    blooms.setMatrixAt(index, matrix)
    blooms.setColorAt(index, new THREE.Color(flower.color))

    scenePosition.y = .49 * height
    matrix.compose(scenePosition, rotation, scale)
    centres.setMatrixAt(index, matrix)
  })
  stems.instanceMatrix.needsUpdate = true
  blooms.instanceMatrix.needsUpdate = true
  centres.instanceMatrix.needsUpdate = true
  if (blooms.instanceColor) blooms.instanceColor.needsUpdate = true
  field.add(stems, blooms, centres)
  return field
}
