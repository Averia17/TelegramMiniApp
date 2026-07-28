import * as THREE from "three"
import {WORLD_SCALE, worldToScene} from "../shared/coordinates.js"
import {flatMaterial} from "../shared/materials.js"

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
      new THREE.CircleGeometry(1, 48, -Math.PI / 4, Math.PI / 2),
      flatMaterial(0xffd84d, {transparent: true, opacity: 0.23, side: THREE.DoubleSide, depthWrite: false, depthTest: false}),
    )
    this.meleeArea.rotation.x = -Math.PI / 2
    this.meleeArea.renderOrder = 2
    this.meleeArea.userData.halfArcDegrees = 45
    this.superLane = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      flatMaterial(0xffe24b, {transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false}),
    )
    this.superLane.rotation.x = -Math.PI / 2
    this.root.add(this.line, this.target, this.meleeArea, this.superLane)
    this.root.visible = false
  }

  update(player) {
    if (!player?.aiming) {
      this.root.visible = false
      return
    }
    const mandy = player.hero === "Mandy"
    const superAiming = mandy && Number(player.channel) > 0
    const melee = player.attackArchetype === "melee_cone"
    const configuredRange = Number(player.attackRange) || 430
    const range = superAiming ? 1800
      : mandy && player.focusCharge >= 100 ? configuredRange * 1.35
      : configuredRange
    const angle = player.rotation || 0
    const steps = 2
    const points = Array.from({length: steps}, (_, index) => {
      const progress = index / (steps - 1)
      return worldToScene(
        player.x + Math.cos(angle) * range * progress,
        player.y + Math.sin(angle) * range * progress,
        3,
      )
    })
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
    this.superLane.visible = superAiming
    if (this.meleeArea.visible) {
      const halfArcDegrees = Number(player.attackHalfArcDegrees) || 45
      if (this.meleeArea.userData.halfArcDegrees !== halfArcDegrees) {
        this.meleeArea.geometry.dispose()
        this.meleeArea.geometry = new THREE.CircleGeometry(
          1,
          48,
          -halfArcDegrees * Math.PI / 180,
          halfArcDegrees * 2 * Math.PI / 180,
        )
        this.meleeArea.userData.halfArcDegrees = halfArcDegrees
      }
      this.meleeArea.position.copy(worldToScene(player.x, player.y, 3))
      this.meleeArea.rotation.y = -angle
      this.meleeArea.scale.setScalar(range * WORLD_SCALE)
      this.meleeArea.material.color.set(player.color || 0xffd84d)
      this.meleeArea.material.opacity = mandy && player.focusCharge >= 100 ? 0.34 : 0.23
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
