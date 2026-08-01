import * as THREE from "three"
import {WORLD_SCALE, worldToScene} from "./shared/coordinates.js"

const CAMERA_ANGLE = THREE.MathUtils.degToRad(55)
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const blend = (speed, delta) => 1 - Math.exp(-speed * delta)
const MAP_FRAME_MARGIN = .96

export const fitVerticalSpanToMap = (preferred, aspect, mapWidth, mapHeight) => Math.max(8, Math.min(
  preferred,
  Number(mapHeight) * WORLD_SCALE * Math.sin(CAMERA_ANGLE) * MAP_FRAME_MARGIN,
  Number(mapWidth) * WORLD_SCALE / Math.max(.01, aspect) * MAP_FRAME_MARGIN,
))

export class CameraRig {
  constructor() {
    this.camera = new THREE.OrthographicCamera(-20, 20, 12, -12, 0.1, 180)
    this.camera.up.set(0, 1, 0)
    this.target = new THREE.Vector3()
    this.width = 1
    this.height = 1
    this.aspect = 1
    this.preferredVertical = 27
    this.vertical = 0
    this.initialized = false
  }

  resize(width, height) {
    this.width = Math.max(1, Math.round(width))
    this.height = Math.max(1, Math.round(height))
    this.aspect = this.width / this.height
    this.preferredVertical = this.width < 700 ? 27 : 31
    this.setVerticalSpan(this.preferredVertical)
  }

  setVerticalSpan(vertical) {
    if (Math.abs(vertical - this.vertical) < .001) return
    this.vertical = vertical
    const horizontal = vertical * this.aspect
    this.camera.left = -horizontal / 2
    this.camera.right = horizontal / 2
    this.camera.top = vertical / 2
    this.camera.bottom = -vertical / 2
    this.camera.updateProjectionMatrix()
  }

  follow(player, map, delta) {
    this.setVerticalSpan(fitVerticalSpanToMap(
      this.preferredVertical,
      this.aspect,
      map.width,
      map.height,
    ))
    // A dead local player is removed from the actor scene, but the camera must
    // not switch to the map centre (the beacon lives there). Hold the last
    // tracked hero position until the result overlay takes over.
    const desired = player
      ? worldToScene(player.x, player.y)
      : this.initialized
        ? this.target.clone()
        : worldToScene(map.width / 2, map.height / 2)
    const halfX = (this.camera.right - this.camera.left) / 2 / WORLD_SCALE
    const halfY = (this.camera.top - this.camera.bottom) / 2 / Math.sin(CAMERA_ANGLE) / WORLD_SCALE
    desired.x = clamp(desired.x, Math.min(map.width / 2, halfX) * WORLD_SCALE, Math.max(map.width / 2, map.width - halfX) * WORLD_SCALE)
    desired.z = clamp(desired.z, Math.min(map.height / 2, halfY) * WORLD_SCALE, Math.max(map.height / 2, map.height - halfY) * WORLD_SCALE)
    if (!this.initialized) {
      this.target.copy(desired)
      this.initialized = true
    } else {
      this.target.lerp(desired, blend(7, delta))
    }
    const distance = 54
    this.camera.position.set(
      this.target.x,
      distance * Math.sin(CAMERA_ANGLE),
      this.target.z + distance * Math.cos(CAMERA_ANGLE),
    )
    this.camera.lookAt(this.target)
  }

  worldToScreen(x, y) {
    const point = worldToScene(x, y).project(this.camera)
    return {x: (point.x + 1) * this.width / 2, y: (1 - point.y) * this.height / 2}
  }

  screenToAimAngle(screenX, screenY, player) {
    if (!player) return null
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(
      new THREE.Vector2(screenX / this.width * 2 - 1, 1 - screenY / this.height * 2),
      this.camera,
    )
    const hit = new THREE.Vector3()
    if (!raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return null
    const worldAngle = Math.atan2(hit.z - player.y * WORLD_SCALE, hit.x - player.x * WORLD_SCALE)
    return Math.atan2(Math.sin(worldAngle) * 0.66, Math.cos(worldAngle))
  }
}
