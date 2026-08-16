import * as THREE from "three"
import {CAMERA_GROUND_PROJECTION} from "../CameraRig.js"
import {WORLD_SCALE, worldToScene} from "../shared/coordinates.js"
import {flatMaterial} from "../shared/materials.js"

const meleeSectorAngles = halfArcDegrees => ({
  start: -halfArcDegrees * Math.PI / 180,
  length: halfArcDegrees * 2 * Math.PI / 180,
})

const createMeleeAreaGeometry = halfArcDegrees => {
  const {start, length} = meleeSectorAngles(halfArcDegrees)
  return new THREE.CircleGeometry(1, 48, start, length)
}

const createMeleeRangeEdgeGeometry = halfArcDegrees => {
  const {start, length} = meleeSectorAngles(halfArcDegrees)
  return new THREE.RingGeometry(0.91, 1, 48, 1, start, length)
}

export class AimRenderer {
  constructor(root) {
    this.root = root
    this.line = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({color: 0xffffff, transparent: true, opacity: 0.82, depthWrite: false}),
    )
    this.target = new THREE.Mesh(
      new THREE.RingGeometry(0.82, 1, 36),
      flatMaterial(0xffffff, {transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false}),
    )
    this.target.rotation.x = -Math.PI / 2
    this.meleeArea = new THREE.Mesh(
      createMeleeAreaGeometry(45),
      flatMaterial(0xffd84d, {transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, depthTest: false}),
    )
    this.meleeArea.rotation.x = -Math.PI / 2
    this.meleeArea.renderOrder = 2
    this.meleeArea.userData.halfArcDegrees = 45
    this.meleeRangeEdge = new THREE.Mesh(
      createMeleeRangeEdgeGeometry(45),
      flatMaterial(0xffffff, {transparent: true, opacity: 0.78, side: THREE.DoubleSide, depthWrite: false, depthTest: false}),
    )
    this.meleeRangeEdge.rotation.x = -Math.PI / 2
    this.meleeRangeEdge.renderOrder = 3
    this.meleeRangeEdge.userData.halfArcDegrees = 45
    this.meleeProjection = new THREE.Group()
    // The orthographic camera is tilted for depth, which otherwise makes a
    // circular ground range look shorter when aiming vertically on screen.
    // Compensate only the aim guide so its shown radius and arc stay constant.
    this.meleeProjection.scale.z = 1 / CAMERA_GROUND_PROJECTION
    this.meleeProjection.add(this.meleeArea, this.meleeRangeEdge)
    this.superLane = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      flatMaterial(0xffe24b, {transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false}),
    )
    this.superLane.rotation.x = -Math.PI / 2
    this.root.add(this.line, this.target, this.meleeProjection, this.superLane)
    this.root.visible = false
  }

  update(player) {
    const mandy = player?.hero === "Mandy"
    const superAiming = mandy && Number(player?.channel) > 0
    if (!player?.aiming) {
      this.root.visible = false
      return
    }

    const melee = player.attackArchetype === "melee_cone"
    const configuredRange = Number(player.attackRange)
    const range = superAiming ? 1800
      : mandy && player.focusCharge >= 100 ? (configuredRange || 430) * 1.35
        : configuredRange || 430
    const angle = Number(player.rotation) || 0

    const points = [0, 1].map(progress => worldToScene(
      player.x + Math.cos(angle) * range * progress,
      player.y + Math.sin(angle) * range * progress,
      3,
    ))
    this.line.geometry.dispose()
    this.line.geometry = new THREE.BufferGeometry().setFromPoints(points)
    this.target.position.copy(worldToScene(
      player.x + Math.cos(angle) * range,
      player.y + Math.sin(angle) * range,
      1,
    ))
    this.target.scale.setScalar(10 * WORLD_SCALE)
    this.line.material.color.set(player.color || 0xffffff)
    this.target.material.color.set(player.color || 0xffffff)
    this.line.visible = !melee && !superAiming
    this.target.visible = !melee && !superAiming
    this.meleeArea.visible = melee && !superAiming
    this.meleeRangeEdge.visible = melee && !superAiming
    this.superLane.visible = superAiming

    if (this.meleeArea.visible) {
      const halfArcDegrees = Number(player.attackHalfArcDegrees) || 45
      if (this.meleeArea.userData.halfArcDegrees !== halfArcDegrees) {
        this.meleeArea.geometry.dispose()
        this.meleeArea.geometry = createMeleeAreaGeometry(halfArcDegrees)
        this.meleeArea.userData.halfArcDegrees = halfArcDegrees
        this.meleeRangeEdge.geometry.dispose()
        this.meleeRangeEdge.geometry = createMeleeRangeEdgeGeometry(halfArcDegrees)
        this.meleeRangeEdge.userData.halfArcDegrees = halfArcDegrees
      }
      this.meleeProjection.position.copy(worldToScene(player.x, player.y, 0))
      this.meleeArea.position.set(0, 3 * WORLD_SCALE, 0)
      this.meleeArea.rotation.y = -angle
      // Use one scalar so changing aim direction only rotates the sector and
      // never changes its gameplay radius or its visual width.
      this.meleeArea.scale.setScalar(range * WORLD_SCALE)
      this.meleeArea.material.color.set(player.color || 0xffd84d)
      this.meleeArea.material.opacity = mandy && player.focusCharge >= 100 ? 0.25 : 0.16
      this.meleeRangeEdge.position.set(0, 3.2 * WORLD_SCALE, 0)
      this.meleeRangeEdge.rotation.y = -angle
      this.meleeRangeEdge.scale.setScalar(range * WORLD_SCALE)
      this.meleeRangeEdge.material.color.set(player.color || 0xffd84d).lerp(new THREE.Color(0xffffff), 0.32)
      this.meleeRangeEdge.material.opacity = mandy && player.focusCharge >= 100 ? 0.95 : 0.78
    }

    if (this.superLane.visible) {
      this.superLane.position.copy(worldToScene(
        player.x + Math.cos(angle) * range / 2,
        player.y + Math.sin(angle) * range / 2,
        1.2,
      ))
      this.superLane.rotation.y = -angle
      this.superLane.scale.set(range * WORLD_SCALE, 100 * WORLD_SCALE, 1)
    }

    this.root.visible = true
  }
}
