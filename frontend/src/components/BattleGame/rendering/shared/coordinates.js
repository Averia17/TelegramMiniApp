import * as THREE from "three"

export const WORLD_SCALE = 0.065

export const worldToScene = (x, y, height = 0) =>
  new THREE.Vector3(x * WORLD_SCALE, height * WORLD_SCALE, y * WORLD_SCALE)

export const sceneToWorld = ({x, y, z}) => ({
  x: x / WORLD_SCALE,
  y: z / WORLD_SCALE,
  height: y / WORLD_SCALE,
})
