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
    this.root.add(this.line, this.target)
    this.root.visible = false
  }

  update(player) {
    if (!player?.aiming) {
      this.root.visible = false
      return
    }
    const ranges = {Shelly: 430, Colt: 650, Barley: 620}
    const range = player.attackType === "barley_lob"
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
    this.root.visible = true
  }
}
