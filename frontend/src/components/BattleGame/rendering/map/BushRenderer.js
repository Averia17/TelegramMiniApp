import * as THREE from "three"
import {WORLD_SCALE} from "../shared/coordinates"
import {flatMaterial} from "../shared/materials"

export const createBushField = walls => {
  const geometry = new THREE.IcosahedronGeometry(0.62, 0)
  const bushes = new THREE.InstancedMesh(geometry, flatMaterial(0x4aaa57), walls.length * 3)
  const matrix = new THREE.Matrix4()
  const axis = new THREE.Vector3(0, 1, 0)
  let instance = 0

  walls.forEach((wall, index) => {
    const centerX = (wall.minX + wall.maxX) * 0.5 * WORLD_SCALE
    const centerZ = (wall.minY + wall.maxY) * 0.5 * WORLD_SCALE
    for (let part = 0; part < 3; part++) {
      const seed = index * 37 + part * 23
      const scale = 0.76 + (seed % 5) * 0.045
      const position = new THREE.Vector3(centerX + Math.sin(seed) * 0.31, 0.5 + part * 0.07, centerZ + Math.cos(seed * 1.7) * 0.29)
      const rotation = new THREE.Quaternion().setFromAxisAngle(axis, seed)
      matrix.compose(position, rotation, new THREE.Vector3(scale * 1.22, scale, scale))
      bushes.setMatrixAt(instance++, matrix)
    }
  })
  bushes.instanceMatrix.needsUpdate = true
  return bushes
}
