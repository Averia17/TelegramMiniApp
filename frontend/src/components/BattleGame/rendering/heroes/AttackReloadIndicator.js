import * as THREE from "three"
import {HEROES_CONFIG} from "../../heroesConfig.js"

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const READY_COLOR = new THREE.Color(0x43d8ff)
const RELOADING_COLOR = new THREE.Color(0x173d58)

export const shouldCreateAttackReloadIndicator = (viewId, localPlayerId) =>
  localPlayerId !== null && localPlayerId !== undefined && String(localPlayerId) !== ""
  && String(viewId) === String(localPlayerId)

export const getAttackReloadSegments = player => {
  const configuredMaxAmmo = HEROES_CONFIG.find(hero => hero.name === player?.hero)?.maxAmmo
  const snapshotMaxAmmo = Number(player?.maxAmmo)
  const maxAmmoValue = Number.isFinite(snapshotMaxAmmo) && snapshotMaxAmmo > 0
    ? snapshotMaxAmmo
    : configuredMaxAmmo || 3
  const maxAmmo = clamp(Math.trunc(maxAmmoValue), 1, 6)
  const ammo = clamp(Math.trunc(Number(player?.ammo) || 0), 0, maxAmmo)
  const reloadProgress = clamp(Number(player?.reloadProgress) || 0, 0, 1)

  return Array.from({length: maxAmmo}, (_, index) => {
    if (index < ammo) return 1
    if (index === ammo && ammo < maxAmmo) return reloadProgress
    return 0
  })
}

const createFloorMaterial = (color, opacity) => new THREE.MeshBasicMaterial({
  color,
  transparent: true,
  opacity,
  depthWrite: false,
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: -2,
})

export class AttackReloadIndicator {
  constructor() {
    this.group = new THREE.Group()
    this.group.name = "attack-reload-indicator"
    this.group.userData.role = "attack-reload-indicator"
    this.group.rotation.x = -Math.PI / 2
    this.group.position.y = .026

    const base = new THREE.Mesh(new THREE.CircleGeometry(1.08, 40), createFloorMaterial(0x30bfe9, .2))
    base.userData.role = "team-circle"
    this.group.add(base)
    this.dashes = []
    this.segmentCount = 0
  }

  rebuild(segmentCount) {
    for (const dash of this.dashes) {
      this.group.remove(dash)
      dash.geometry.dispose()
      dash.material.dispose()
    }
    this.dashes = []
    this.segmentCount = segmentCount

    const slotGap = .18
    const slotArc = (Math.PI * 2 - slotGap * segmentCount) / segmentCount
    const dashGap = .055
    for (let slot = 0; slot < segmentCount; slot += 1) {
      const slotStart = Math.PI / 2 + slot * (slotArc + slotGap)
      const geometry = new THREE.RingGeometry(1.16, 1.31, 8, 1, slotStart + dashGap / 2, slotArc - dashGap)
      const dash = new THREE.Mesh(geometry, createFloorMaterial(RELOADING_COLOR, .58))
      dash.userData = {role: "reload-dash", slot}
      this.group.add(dash)
      this.dashes.push(dash)
    }
  }

  update(player) {
    const segments = getAttackReloadSegments(player)
    if (segments.length !== this.segmentCount) this.rebuild(segments.length)
    this.group.visible = Number(player?.lives) > 0

    for (const dash of this.dashes) {
      const fill = clamp(segments[dash.userData.slot], 0, 1)
      dash.material.color.copy(RELOADING_COLOR).lerp(READY_COLOR, fill)
      dash.material.opacity = .58 + fill * .38
    }
  }
}
