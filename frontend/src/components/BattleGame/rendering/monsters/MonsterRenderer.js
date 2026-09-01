import * as THREE from "three"
import {WORLD_SCALE, worldToScene} from "../shared/coordinates.js"
import {disposeObjectTree} from "../shared/disposal.js"
import {endBattlePerformance, startBattlePerformance} from "../shared/performance.js"
import {createContactShadow} from "../shared/materials.js"
import {createHealthBadge, updateHealthBadge} from "../heroes/healthBadge.js"

const BAT_HEIGHT = 22
const HEALTH_BADGE_PARENT_SCALE = 2.2
const MONSTER_VISUAL_PROFILES = {
  bat: {body: 0x48206f, wing: 0x62318c, accent: 0xff4057, wings: true, scale: [1, 1, 1]},
  ash_hound: {body: 0x6b4235, wing: 0x8c4f39, accent: 0xff8a3d, wings: false, scale: [1.28, .82, .92]},
  root_guardian: {body: 0x315d4a, wing: 0x427e5a, accent: 0x9be66f, wings: false, scale: [.96, 1.32, 1.08]},
}

export const getMonsterVisualProfile = kind => (
  MONSTER_VISUAL_PROFILES[String(kind || "bat")] || MONSTER_VISUAL_PROFILES.bat
)
export const getHealthBarFraction = (current, maximum) => (
  Math.max(0, Math.min(1, (Number(current) || 0) / Math.max(1, Number(maximum) || 1)))
)

export const formatHealthLabel = (lives, maxLives) => {
  const maximum = Math.max(1, Math.round(Number(maxLives) || 1))
  const current = Math.max(0, Math.min(maximum, Math.round(Number(lives) || 0)))
  return `${current} / ${maximum}`
}

const createWingGeometry = side => {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0)
  shape.lineTo(side * 0.72, 0.34)
  shape.lineTo(side * 1.05, 0.03)
  shape.lineTo(side * 0.78, -0.12)
  shape.lineTo(side * 0.55, -0.34)
  shape.lineTo(side * 0.31, -0.14)
  shape.closePath()
  return new THREE.ShapeGeometry(shape)
}

const createHealthBar = () => {
  const group = new THREE.Group()
  group.scale.set(HEALTH_BADGE_PARENT_SCALE, HEALTH_BADGE_PARENT_SCALE, 1)
  const label = createHealthBadge({
    scale: [1.18, .25, 1],
    positionY: .14,
    showName: false,
    parentScale: HEALTH_BADGE_PARENT_SCALE,
  })
  group.add(label)
  group.position.set(0, 1.16, 0)
  group.renderOrder = 18
  return {group, fill: null, label}
}

const createWindupTelegraph = () => {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(.82, 1.02, 32),
    new THREE.MeshBasicMaterial({
      color: 0xff486f,
      transparent: true,
      opacity: .85,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = -BAT_HEIGHT * WORLD_SCALE + .04
  ring.renderOrder = 17
  ring.visible = false
  ring.userData.role = "bat-windup-telegraph"
  return ring
}

const createNoticeTelegraph = () => {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(.92, 1.08, 32),
    new THREE.MeshBasicMaterial({
      color: 0xffd43b,
      transparent: true,
      opacity: .7,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = -BAT_HEIGHT * WORLD_SCALE + .045
  ring.renderOrder = 17
  ring.visible = false
  ring.userData.role = "bat-notice-telegraph"
  return ring
}

const createBat = state => {
  const group = new THREE.Group()
  const kind = String(state.kind || "bat")
  const profile = getMonsterVisualProfile(kind)
  group.userData.kind = kind
  group.userData.tier = Number(state.tier) || 1

  const tier = group.userData.tier
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: tier >= 2 ? profile.accent : profile.body,
    roughness: .66,
    emissive: tier >= 2 ? profile.body : 0x130021,
    emissiveIntensity: .45,
    side: THREE.DoubleSide,
  })
  const body = new THREE.Mesh(new THREE.SphereGeometry(.43, 14, 10), bodyMaterial)
  body.scale.set(.82 * profile.scale[0], 1.05 * profile.scale[1], .72 * profile.scale[2])
  body.castShadow = true

  const head = new THREE.Mesh(new THREE.SphereGeometry(.35, 14, 10), bodyMaterial.clone())
  head.position.set(0, .36, .05)
  head.scale.set(1, .78, .9)
  head.castShadow = true

  const earGeometry = new THREE.ConeGeometry(.13, .36, 5)
  const leftEar = new THREE.Mesh(earGeometry, bodyMaterial.clone())
  leftEar.position.set(-.2, .67, 0)
  leftEar.rotation.z = .22
  const rightEar = leftEar.clone()
  rightEar.position.x = .2
  rightEar.rotation.z = -.22

  const eyeMaterial = new THREE.MeshBasicMaterial({color: tier >= 2 ? 0xffd43b : 0xff4057})
  for (const x of [-.12, .12]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.045, 8, 6), eyeMaterial)
    eye.position.set(x, .4, .3)
    group.add(eye)
  }

  const wingMaterial = new THREE.MeshStandardMaterial({
    color: tier >= 2 ? profile.accent : profile.wing,
    roughness: .78,
    side: THREE.DoubleSide,
  })
  const leftWing = new THREE.Mesh(createWingGeometry(-1), wingMaterial)
  const rightWing = new THREE.Mesh(createWingGeometry(1), wingMaterial.clone())
  leftWing.position.set(-.22, .2, 0)
  rightWing.position.set(.22, .2, 0)
  leftWing.castShadow = rightWing.castShadow = true
  leftWing.visible = rightWing.visible = profile.wings

  if (kind === "ash_hound") {
    const hornMaterial = new THREE.MeshStandardMaterial({color: profile.accent, emissive: 0x3a1206, emissiveIntensity: .6})
    for (const x of [-.18, .18]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(.10, .34, 5), hornMaterial.clone())
      horn.position.set(x, .57, .02)
      horn.rotation.z = x < 0 ? .25 : -.25
      horn.userData.role = "ash-hound-horn"
      group.add(horn)
    }
    const ember = new THREE.Mesh(new THREE.SphereGeometry(.09, 8, 6), new THREE.MeshBasicMaterial({color: profile.accent}))
    ember.position.set(0, .16, .38)
    ember.userData.role = "ash-hound-ember"
    group.add(ember)
  }

  if (kind === "root_guardian") {
    const rootMaterial = new THREE.MeshStandardMaterial({color: profile.accent, emissive: 0x173c20, emissiveIntensity: .48})
    const crown = new THREE.Mesh(new THREE.TorusGeometry(.48, .055, 7, 18), rootMaterial)
    crown.rotation.x = Math.PI / 2
    crown.position.y = .58
    crown.userData.role = "root-guardian-crown"
    group.add(crown)
    for (const x of [-.28, 0, .28]) {
      const root = new THREE.Mesh(new THREE.ConeGeometry(.07, .38, 5), rootMaterial.clone())
      root.position.set(x, -.18, .05)
      root.rotation.z = x * .7
      root.userData.role = "root-guardian-vine"
      group.add(root)
    }
  }

  const shadow = createContactShadow(.72)
  shadow.position.y = -BAT_HEIGHT * WORLD_SCALE + .02
  const noticeTelegraph = createNoticeTelegraph()
  const windupTelegraph = createWindupTelegraph()
  const health = createHealthBar()
  updateHealthBadge(health.label, state, {healthColor: "#ff4657"})
  group.add(shadow, noticeTelegraph, windupTelegraph, leftWing, rightWing, body, head, leftEar, rightEar, health.group)

  const visualScale = Math.max(.82, Number(state.radius) * WORLD_SCALE / 1.45)
  group.scale.setScalar(visualScale)
  group.position.copy(worldToScene(state.x, state.y, BAT_HEIGHT))
  return {
    group,
    leftWing,
    rightWing,
    body,
    healthBar: health.group,
    healthFill: null,
    healthLabel: health.label,
    healthFraction: getHealthBarFraction(state.lives, state.maxLives),
    noticeTelegraph,
    windupTelegraph,
    targetX: state.x,
    targetY: state.y,
  }
}

export class MonsterRenderer {
  constructor(parent) {
    this.root = new THREE.Group()
    this.root.name = "MonsterRoot"
    this.views = new Map()
    parent.add(this.root)
  }

  sync(monsters = {}) {
    const perfToken = startBattlePerformance("monsters.sync")
    const active = new Set()
    Object.entries(monsters || {}).forEach(([id, state]) => {
      if (Number(state?.lives) <= 0) return
      active.add(String(id))
      let view = this.views.get(String(id))
      if (!view || view.group.userData.kind !== String(state.kind || "bat")) {
        if (view) {
          this.root.remove(view.group)
          disposeObjectTree(view.group)
          this.views.delete(String(id))
        }
        view = createBat(state)
        this.views.set(String(id), view)
        this.root.add(view.group)
      }
      view.targetX = state.x
      view.targetY = state.y
      this.updateView(view, state)
      const health = getHealthBarFraction(state.lives, state.maxLives)
      view.healthFraction = health
      updateHealthBadge(view.healthLabel, state, {healthColor: "#ff4657"})
    })
    this.views.forEach((view, id) => {
      if (active.has(id)) return
      this.root.remove(view.group)
      disposeObjectTree(view.group)
      this.views.delete(id)
    })
    endBattlePerformance(perfToken)
  }

  updateView(view, state) {
    view.group.position.copy(worldToScene(state.x, state.y, BAT_HEIGHT))
    view.group.rotation.y = Math.PI / 2 - (Number(state.rotation) || 0)
    const noticing = state.state === "notice"
    const windingUp = state.state === "windup"
    view.noticeTelegraph.visible = noticing
    view.windupTelegraph.visible = windingUp
    if (noticing) {
      const remaining = Math.max(0, Number(state.noticeUntil) - Date.now())
      const pulse = 1 + Math.sin(remaining / 55) * .1
      view.noticeTelegraph.scale.setScalar(pulse)
    }
    if (windingUp) {
      const remaining = Math.max(0, Number(state.windupUntil) - Date.now())
      const pulse = .9 + Math.sin(remaining / 60) * .08
      view.windupTelegraph.scale.setScalar(pulse)
    }
  }

  setDisplayState(monsters = {}) {
    const perfToken = startBattlePerformance("monsters.display")
    Object.entries(monsters || {}).forEach(([id, state]) => {
      if (Number(state?.lives) <= 0) return
      const view = this.views.get(String(id))
      if (view) this.updateView(view, state)
    })
    endBattlePerformance(perfToken)
  }

  update(delta, time) {
    this.views.forEach((view, id) => {
      const phase = time * 10 + Number.parseInt(id.replace(/\D/g, "") || "0", 10) * .7
      const flap = Math.sin(phase)
      view.leftWing.rotation.z = -.22 - flap * .5
      view.rightWing.rotation.z = .22 + flap * .5
      view.body.position.y = Math.sin(phase * .5) * .055
      view.group.position.y = BAT_HEIGHT * WORLD_SCALE + Math.sin(phase * .5) * .08
      view.group.rotation.z = Math.sin(phase * .35) * .035
      void delta
    })
  }

  dispose() {
    disposeObjectTree(this.root)
    this.root.removeFromParent()
    this.views.clear()
  }
}
