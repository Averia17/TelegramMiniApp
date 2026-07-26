import * as THREE from "three"
import {WORLD_SCALE, worldToScene} from "../shared/coordinates"
import {flatMaterial} from "../shared/materials"

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

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
    this.mandyCone = new THREE.Mesh(
      new THREE.CircleGeometry(1, 48, -42 * Math.PI / 180, 84 * Math.PI / 180),
      flatMaterial(0xffd84d, {transparent: true, opacity: 0.23, side: THREE.DoubleSide, depthWrite: false}),
    )
    this.mandyCone.rotation.x = -Math.PI / 2
    this.superLane = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      flatMaterial(0xffe24b, {transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false}),
    )
    this.superLane.rotation.x = -Math.PI / 2
    this.root.add(this.line, this.target, this.mandyCone, this.superLane)
    this.root.visible = false
  }

  update(player) {
    if (!player?.aiming) {
      this.root.visible = false
      return
    }
    const mandy = player.hero === "Mandy"
    const superAiming = mandy && Number(player.channel) > 0
    const ranges = {Shelly: 430, Colt: 650, Barley: 620, Mandy: player.focusCharge >= 100 ? 162 : 120}
    const range = superAiming ? 1800 : player.attackType === "barley_lob"
      ? clamp(player.aimDistance || 620, 70, 620)
      : ranges[player.hero] || 430
    const angle = player.rotation || 0
    const steps = player.attackType === "barley_lob" ? 20 : 2
    const points = Array.from({length: steps}, (_, index) => {
      const progress = index / (steps - 1)
      const height = player.attackType === "barley_lob" ? Math.sin(progress * Math.PI) * 90 : 1
      return worldToScene(
        player.x + Math.cos(angle) * range * progress,
        player.y + Math.sin(angle) * range * progress,
        height + 2,
      )
    })
    this.line.geometry.dispose()
    this.line.geometry = new THREE.BufferGeometry().setFromPoints(points)
    this.target.position.copy(worldToScene(
      player.x + Math.cos(angle) * range,
      player.y + Math.sin(angle) * range,
      1,
    ))
    const radius = player.attackType === "barley_lob"
      ? 60
      : player.attackType === "shelly_shotgun" ? Math.tan(Math.PI / 12) * range : 10
    this.target.scale.setScalar(radius * WORLD_SCALE)
    this.line.visible = !mandy
    this.target.visible = !mandy
    this.mandyCone.visible = mandy && !superAiming
    this.superLane.visible = superAiming
    if (this.mandyCone.visible) {
      this.mandyCone.position.copy(worldToScene(player.x, player.y, 1))
      this.mandyCone.rotation.y = -angle
      this.mandyCone.scale.setScalar(range * WORLD_SCALE)
      this.mandyCone.material.opacity = player.focusCharge >= 100 ? 0.34 : 0.2
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
