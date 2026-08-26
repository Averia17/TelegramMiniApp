import * as THREE from "three"
import {WORLD_SCALE, worldToScene} from "../shared/coordinates.js"
import {disposeObjectTree} from "../shared/disposal.js"
import {endBattlePerformance, startBattlePerformance} from "../shared/performance.js"
import {createContactShadow} from "../shared/materials.js"
import {createHealthBadge, updateHealthBadge} from "../heroes/healthBadge.js"

const BAT_HEIGHT = 22
const HEALTH_BADGE_PARENT_SCALE = 2.2
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
  group.userData.kind = "bat"
  group.userData.tier = Number(state.tier) || 1

  const tier = group.userData.tier
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: tier >= 2 ? 0x7227a8 : 0x48206f,
    roughness: .66,
    emissive: tier >= 2 ? 0x26003d : 0x130021,
    emissiveIntensity: .45,
    side: THREE.DoubleSide,
  })
  const body = new THREE.Mesh(new THREE.SphereGeometry(.43, 14, 10), bodyMaterial)
  body.scale.set(.82, 1.05, .72)
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
    color: tier >= 2 ? 0x9437c7 : 0x62318c,
    roughness: .78,
    side: THREE.DoubleSide,
  })
  const leftWing = new THREE.Mesh(createWingGeometry(-1), wingMaterial)
  const rightWing = new THREE.Mesh(createWingGeometry(1), wingMaterial.clone())
  leftWing.position.set(-.22, .2, 0)
  rightWing.position.set(.22, .2, 0)
  leftWing.castShadow = rightWing.castShadow = true

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
      if (!view) {
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
