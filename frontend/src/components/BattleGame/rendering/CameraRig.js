import * as THREE from "three"
import {WORLD_SCALE, worldToScene} from "./shared/coordinates.js"

const CAMERA_ANGLE = THREE.MathUtils.degToRad(55)
export const CAMERA_GROUND_PROJECTION = Math.sin(CAMERA_ANGLE)
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const blend = (speed, delta) => 1 - Math.exp(-speed * delta)
const MAP_FRAME_MARGIN = .96
const CAMERA_LOOK_AHEAD_WORLD = 64
const CAMERA_MOVE_LOOK_AHEAD_WORLD = 40
const CAMERA_DEAD_ZONE_WORLD = 8

export const fitVerticalSpanToMap = (preferred, aspect, mapWidth, mapHeight) => Math.max(8, Math.min(
  preferred,
  Number(mapHeight) * WORLD_SCALE * CAMERA_GROUND_PROJECTION * MAP_FRAME_MARGIN,
  Number(mapWidth) * WORLD_SCALE / Math.max(.01, aspect) * MAP_FRAME_MARGIN,
))

export class CameraRig {
  constructor({reducedShake = false} = {}) {
    this.camera = new THREE.OrthographicCamera(-20, 20, 12, -12, 0.1, 180)
    this.camera.up.set(0, 1, 0)
    this.target = new THREE.Vector3()
    this.width = 1
    this.height = 1
    this.aspect = 1
    this.preferredVertical = 27
    this.vertical = 0
    this.followOffset = new THREE.Vector2()
    this.lookAhead = new THREE.Vector2()
    this.lastPlayerPosition = null
    this.initialized = false
    this.shake = 0
    this.shakeTime = 0
    this.reducedShake = Boolean(reducedShake)
  }

  addShake(amount = .08) {
    if (this.reducedShake) return
    this.shake = Math.min(.34, this.shake + Math.max(0, Number(amount) || 0))
  }

  resize(width, height) {
    this.width = Math.max(1, Math.round(width))
    this.height = Math.max(1, Math.round(height))
    this.aspect = this.width / this.height
    // A slightly wider phone frame makes the same world-space movement read
    // less aggressively on the small screens used for the main client.
    this.preferredVertical = this.width < 700 ? 30 : 31
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

  panByScreen(deltaX, deltaY) {
    const horizontalScenePerPixel = (this.camera.right - this.camera.left) / this.width
    const verticalScenePerPixel = (this.camera.top - this.camera.bottom) / this.height / CAMERA_GROUND_PROJECTION
    this.followOffset.x -= Number(deltaX) * horizontalScenePerPixel / WORLD_SCALE
    this.followOffset.y -= Number(deltaY) * verticalScenePerPixel / WORLD_SCALE
  }

  resetPan() {
    this.followOffset.set(0, 0)
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
    if (player && !this.lastPlayerPosition) {
      this.lastPlayerPosition = new THREE.Vector2(player.x, player.y)
    } else if (player && this.lastPlayerPosition) {
      const dx = player.x - this.lastPlayerPosition.x
      const dy = player.y - this.lastPlayerPosition.y
      if (Math.hypot(dx, dy) > CAMERA_DEAD_ZONE_WORLD) {
        this.lastPlayerPosition.set(player.x, player.y)
      }
    }

    const lookAheadTarget = new THREE.Vector2()
    if (player) {
      const rotation = Number(player.rotation)
      const moveX = Number(player.moveX) || 0
      const moveY = Number(player.moveY) || 0
      const moveLength = Math.hypot(moveX, moveY)
      if (player.aiming === true && Number.isFinite(rotation)) {
        lookAheadTarget.set(
          Math.cos(rotation) * CAMERA_LOOK_AHEAD_WORLD,
          Math.sin(rotation) * CAMERA_LOOK_AHEAD_WORLD,
        )
      } else if (moveLength > .01) {
        lookAheadTarget.set(
          moveX / moveLength * CAMERA_MOVE_LOOK_AHEAD_WORLD,
          moveY / moveLength * CAMERA_MOVE_LOOK_AHEAD_WORLD,
        )
      }
    }
    this.lookAhead.lerp(lookAheadTarget, blend(10, delta))

    const desired = player && this.lastPlayerPosition
      ? worldToScene(
        this.lastPlayerPosition.x + this.followOffset.x + this.lookAhead.x,
        this.lastPlayerPosition.y + this.followOffset.y + this.lookAhead.y,
      )
      : this.initialized
        ? this.target.clone()
        : worldToScene(map.width / 2 + this.followOffset.x, map.height / 2 + this.followOffset.y)
    const halfX = (this.camera.right - this.camera.left) / 2 / WORLD_SCALE
    const halfY = (this.camera.top - this.camera.bottom) / 2 / CAMERA_GROUND_PROJECTION / WORLD_SCALE
    desired.x = clamp(desired.x, Math.min(map.width / 2, halfX) * WORLD_SCALE, Math.max(map.width / 2, map.width - halfX) * WORLD_SCALE)
    desired.z = clamp(desired.z, Math.min(map.height / 2, halfY) * WORLD_SCALE, Math.max(map.height / 2, map.height - halfY) * WORLD_SCALE)
    if (!this.initialized) {
      this.target.copy(desired)
      this.initialized = true
    } else {
      this.target.lerp(desired, blend(7, delta))
    }
    this.shake = Math.max(0, this.shake - delta * 1.15)
    this.shakeTime += delta
    const shake = this.shake * this.shake
    const offsetX = Math.sin(this.shakeTime * 67) * shake
    const offsetY = Math.cos(this.shakeTime * 79) * shake * .42
    const offsetZ = Math.sin(this.shakeTime * 91) * shake
    const distance = 54
    this.camera.position.set(
      this.target.x + offsetX,
      distance * Math.sin(CAMERA_ANGLE) + offsetY,
      this.target.z + distance * Math.cos(CAMERA_ANGLE) + offsetZ,
    )
    this.camera.lookAt(this.target.x + offsetX * .26, this.target.y + offsetY * .26, this.target.z + offsetZ * .26)
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
    return Math.atan2(hit.z - player.y * WORLD_SCALE, hit.x - player.x * WORLD_SCALE)
  }
}
