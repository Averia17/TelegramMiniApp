import * as THREE from "three"

const PREVIEW_CAMERA_VERTICAL = {
  stage: {half: 3, center: .4},
  card: {half: 2.35, center: 0},
}

const boxCorners = box => [
  new THREE.Vector3(box.min.x, box.min.y, box.min.z),
  new THREE.Vector3(box.min.x, box.min.y, box.max.z),
  new THREE.Vector3(box.min.x, box.max.y, box.min.z),
  new THREE.Vector3(box.min.x, box.max.y, box.max.z),
  new THREE.Vector3(box.max.x, box.min.y, box.min.z),
  new THREE.Vector3(box.max.x, box.min.y, box.max.z),
  new THREE.Vector3(box.max.x, box.max.y, box.min.z),
  new THREE.Vector3(box.max.x, box.max.y, box.max.z),
]
const PREVIEW_CAMERA_MIN_HORIZONTAL_HALF = {
  stage: 2.9,
  card: 2,
}
const PREVIEW_CAMERA_HORIZONTAL_PADDING = {
  stage: 1.12,
  card: 1.04,
}

export const getPreviewCameraBounds = ({width, height, stage = false}) => {
  const layout = PREVIEW_CAMERA_VERTICAL[stage ? "stage" : "card"]
  const aspect = Math.max(width, 1) / Math.max(height, 1)
  const horizontalHalf = Math.max(
    PREVIEW_CAMERA_MIN_HORIZONTAL_HALF[stage ? "stage" : "card"],
    layout.half * aspect,
  ) * PREVIEW_CAMERA_HORIZONTAL_PADDING[stage ? "stage" : "card"]

  return {
    left: -horizontalHalf,
    right: horizontalHalf,
    top: layout.center + layout.half,
    bottom: layout.center - layout.half,
  }
}

export const getPreviewFitBounds = ({camera, object, width, height, padding = 1.16}) => {
  if (!camera || !object) return null

  camera.updateMatrixWorld(true)
  object.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(object, true)
  if (box.isEmpty()) return null

  const projected = boxCorners(box).map(corner => camera.worldToLocal(corner))
  const minX = Math.min(...projected.map(point => point.x))
  const maxX = Math.max(...projected.map(point => point.x))
  const minY = Math.min(...projected.map(point => point.y))
  const maxY = Math.max(...projected.map(point => point.y))
  const aspect = Math.max(width, 1) / Math.max(height, 1)
  const halfHeight = Math.max(
    (maxY - minY) * padding / 2,
    (maxX - minX) * padding / aspect / 2,
  )
  const halfWidth = halfHeight * aspect
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  return {
    left: centerX - halfWidth,
    right: centerX + halfWidth,
    top: centerY + halfHeight,
    bottom: centerY - halfHeight,
  }
}
