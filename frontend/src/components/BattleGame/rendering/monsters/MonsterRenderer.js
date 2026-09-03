import * as THREE from "three"
import {WORLD_SCALE, worldToScene} from "../shared/coordinates.js"
import {disposeObjectTree} from "../shared/disposal.js"
import {endBattlePerformance, startBattlePerformance} from "../shared/performance.js"
import {createContactShadow} from "../shared/materials.js"
import {createHealthBadge, updateHealthBadge} from "../heroes/healthBadge.js"

const HEALTH_BADGE_PARENT_SCALE = 2.2
const MONSTER_VISUAL_PROFILES = {
  // `size` changes the whole silhouette, while `groundOffset` is the local
  // distance from the actor origin to the feet. Keeping those values in the
  // profile prevents every authored kind from inheriting the bat's old hover.
  bat: {
    body: 0x48206f,
    wing: 0x62318c,
    accent: 0xff4057,
    wings: true,
    size: .86,
    groundOffset: .50,
    hoverAmplitude: 0,
    shadowRadius: .62,
    healthBarOffset: 1.12,
    scale: [1, 1, 1],
  },
  ash_hound: {
    body: 0x6b4235,
    wing: 0x8c4f39,
    accent: 0xff8a3d,
    wings: false,
    size: 1.18,
    groundOffset: .42,
    hoverAmplitude: 0,
    shadowRadius: .72,
    healthBarOffset: 1.02,
    scale: [1.28, .82, .92],
  },
  root_guardian: {
    body: 0x315d4a,
    wing: 0x427e5a,
    accent: 0x9be66f,
    wings: false,
    size: 1.42,
    groundOffset: .64,
    hoverAmplitude: 0,
    shadowRadius: .82,
    healthBarOffset: 1.30,
    scale: [.96, 1.32, 1.08],
  },
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

const createWindupTelegraph = (groundOffset, visualScale) => {
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
  ring.position.y = -groundOffset + .04 / visualScale
  ring.renderOrder = 17
  ring.visible = false
  ring.userData.role = "bat-windup-telegraph"
  return ring
}

const createNoticeTelegraph = (groundOffset, visualScale) => {
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
  ring.position.y = -groundOffset + .045 / visualScale
  ring.renderOrder = 17
  ring.visible = false
  ring.userData.role = "bat-notice-telegraph"
  return ring
}

const createBat = state => {
  const group = new THREE.Group()
  const kind = String(state.kind || "bat")
  const profile = getMonsterVisualProfile(kind)
  const visualScale = Math.max(.82, Number(state.radius) * WORLD_SCALE / 1.45) * profile.size
  const groundHeight = visualScale * profile.groundOffset
  group.userData.kind = kind
  group.userData.tier = Number(state.tier) || 1
  group.userData.visualScale = visualScale
  group.userData.grounded = true

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
    eye.userData.role = "bat-eye"
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
  leftWing.userData.role = "bat-wing"
  rightWing.userData.role = "bat-wing"
  leftWing.castShadow = rightWing.castShadow = true
  leftWing.visible = rightWing.visible = profile.wings

  const houndLegs = []
  let houndTail = null
  let houndEmber = null
  let houndCollar = null
  const guardianVines = []
  const guardianVineBaseRotations = []
  const guardianBarkBands = []
  const guardianShoulders = []
  let guardianCrown = null
  let guardianCore = null

  if (kind === "bat") {
    const belly = new THREE.Mesh(
      new THREE.SphereGeometry(.29, 10, 8),
      new THREE.MeshStandardMaterial({color: 0x8748a6, roughness: .78}),
    )
    belly.position.set(0, .04, .27)
    belly.scale.set(.92, 1.05, .28)
    belly.userData.role = "bat-belly"
    group.add(belly)
    const fangMaterial = new THREE.MeshStandardMaterial({color: 0xf4e9d0, roughness: .48})
    for (const x of [-.12, .12]) {
      const fang = new THREE.Mesh(new THREE.ConeGeometry(.045, .16, 6), fangMaterial.clone())
      fang.position.set(x, .20, .31)
      fang.rotation.z = Math.PI
      fang.userData.role = "bat-fang"
      group.add(fang)
    }
  }

  if (kind === "ash_hound") {
    const hornMaterial = new THREE.MeshStandardMaterial({color: profile.accent, emissive: 0x3a1206, emissiveIntensity: .6})
    for (const x of [-.18, .18]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(.10, .34, 5), hornMaterial.clone())
      horn.position.set(x, .57, .02)
      horn.rotation.z = x < 0 ? .25 : -.25
      horn.userData.role = "ash-hound-horn"
      group.add(horn)
    }
    houndCollar = new THREE.Mesh(
      new THREE.TorusGeometry(.31, .045, 7, 16),
      new THREE.MeshStandardMaterial({color: profile.accent, emissive: 0x3a1206, emissiveIntensity: .35, roughness: .55}),
    )
    houndCollar.rotation.x = Math.PI / 2
    houndCollar.position.set(0, .31, .02)
    houndCollar.userData.role = "ash-hound-collar"
    group.add(houndCollar)
    const snout = new THREE.Mesh(new THREE.SphereGeometry(.22, 10, 8), bodyMaterial.clone())
    snout.position.set(0, .18, .31)
    snout.scale.set(1.15, .68, 1.22)
    snout.userData.role = "ash-hound-snout"
    group.add(snout)
    const nose = new THREE.Mesh(new THREE.SphereGeometry(.075, 8, 6), new THREE.MeshStandardMaterial({color: 0x211820, roughness: .42}))
    nose.position.set(0, .18, .56)
    nose.scale.set(1.15, .75, .7)
    nose.userData.role = "ash-hound-nose"
    group.add(nose)
    for (const x of [-.31, .31]) {
      const shoulder = new THREE.Mesh(new THREE.DodecahedronGeometry(.16, 0), bodyMaterial.clone())
      shoulder.position.set(x, .06, .02)
      shoulder.scale.set(.9, 1.1, .8)
      shoulder.userData.role = "ash-hound-shoulder"
      shoulder.castShadow = true
      group.add(shoulder)
    }
    for (const x of [-.22, .22]) {
      for (const z of [-.17, .17]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(.085, .105, .34, 7), bodyMaterial.clone())
        leg.position.set(x, -.30, z)
        leg.rotation.z = x < 0 ? -.06 : .06
        leg.userData.role = "ash-hound-leg"
        leg.castShadow = true
        houndLegs.push(leg)
        group.add(leg)
        const paw = new THREE.Mesh(new THREE.SphereGeometry(.115, 8, 6), bodyMaterial.clone())
        paw.position.set(x, -.49, z + .015)
        paw.scale.set(1.1, .55, 1.25)
        paw.userData.role = "ash-hound-paw"
        paw.castShadow = true
        group.add(paw)
      }
    }
    houndTail = new THREE.Mesh(new THREE.ConeGeometry(.13, .62, 7), bodyMaterial.clone())
    houndTail.position.set(0, .05, -.43)
    houndTail.rotation.x = -Math.PI / 2
    houndTail.userData.role = "ash-hound-tail"
    houndTail.castShadow = true
    group.add(houndTail)
    houndEmber = new THREE.Mesh(new THREE.SphereGeometry(.09, 8, 6), new THREE.MeshBasicMaterial({color: profile.accent}))
    houndEmber.position.set(0, .16, .38)
    houndEmber.userData.role = "ash-hound-ember"
    group.add(houndEmber)
  }

  if (kind === "root_guardian") {
    const rootMaterial = new THREE.MeshStandardMaterial({color: profile.accent, emissive: 0x173c20, emissiveIntensity: .48})
    const barkMaterial = new THREE.MeshStandardMaterial({color: 0x274838, roughness: .94})
    guardianCore = new THREE.Mesh(new THREE.SphereGeometry(.13, 10, 8), new THREE.MeshBasicMaterial({color: profile.accent}))
    guardianCore.position.set(0, .02, .42)
    guardianCore.userData.role = "root-guardian-core"
    group.add(guardianCore)
    guardianCrown = new THREE.Mesh(new THREE.TorusGeometry(.48, .055, 7, 18), rootMaterial)
    guardianCrown.rotation.x = Math.PI / 2
    guardianCrown.position.y = .58
    guardianCrown.userData.role = "root-guardian-crown"
    group.add(guardianCrown)
    for (const [y, radius] of [[-.02, .42], [.25, .36]]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(radius, .045, 6, 14), barkMaterial.clone())
      band.rotation.x = Math.PI / 2
      band.position.y = y
      band.userData.role = "root-guardian-bark-band"
      guardianBarkBands.push(band)
      group.add(band)
    }
    for (const x of [-.38, .38]) {
      const shoulder = new THREE.Mesh(new THREE.DodecahedronGeometry(.20, 0), barkMaterial.clone())
      shoulder.position.set(x, .18, .02)
      shoulder.scale.set(.9, 1.2, .86)
      shoulder.userData.role = "root-guardian-shoulder"
      shoulder.castShadow = true
      guardianShoulders.push(shoulder)
      group.add(shoulder)
    }
    for (const x of [-.28, 0, .28]) {
      const root = new THREE.Mesh(new THREE.ConeGeometry(.07, .38, 5), rootMaterial.clone())
      root.position.set(x, -.18, .05)
      root.rotation.z = x * .7
      root.userData.role = "root-guardian-vine"
      guardianVines.push(root)
      guardianVineBaseRotations.push(root.rotation.z)
      group.add(root)
    }
  }

  const shadow = createContactShadow(profile.shadowRadius)
  shadow.position.y = -profile.groundOffset
  const noticeTelegraph = createNoticeTelegraph(profile.groundOffset, visualScale)
  const windupTelegraph = createWindupTelegraph(profile.groundOffset, visualScale)
  const health = createHealthBar()
  health.group.position.y = profile.healthBarOffset
  updateHealthBadge(health.label, state, {healthColor: "#ff4657"})
  group.add(shadow, noticeTelegraph, windupTelegraph, leftWing, rightWing, body, head, leftEar, rightEar, health.group)

  group.scale.setScalar(visualScale)
  group.position.copy(worldToScene(state.x, state.y, groundHeight / WORLD_SCALE))
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
    groundHeight,
    hoverAmplitude: profile.hoverAmplitude,
    legs: houndLegs,
    tail: houndTail,
    ember: houndEmber,
    collar: houndCollar,
    vines: guardianVines,
    vineBaseRotations: guardianVineBaseRotations,
    barkBands: guardianBarkBands,
    shoulders: guardianShoulders,
    crown: guardianCrown,
    core: guardianCore,
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
    view.group.position.copy(worldToScene(state.x, state.y, view.groundHeight / WORLD_SCALE))
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
      if (view.group.userData.kind === "bat") {
        view.leftWing.rotation.z = -.22 - flap * .5
        view.rightWing.rotation.z = .22 + flap * .5
      }
      if (view.group.userData.kind === "ash_hound") {
        view.legs.forEach((leg, index) => {
          const stride = Math.sin(phase * 1.25 + (index % 2) * Math.PI) * .22
          leg.rotation.z = (index % 2 === 0 ? -.06 : .06) + stride
        })
        if (view.tail) view.tail.rotation.z = Math.sin(phase * .8) * .16
        if (view.ember) view.ember.scale.setScalar(1 + Math.sin(phase * 1.4) * .18)
        if (view.collar) view.collar.scale.setScalar(1 + Math.sin(phase * .7) * .025)
      }
      if (view.group.userData.kind === "root_guardian") {
        view.vines.forEach((vine, index) => {
          vine.rotation.z = view.vineBaseRotations[index] + Math.sin(phase * .42 + index * .9) * .10
        })
        if (view.crown) view.crown.rotation.z = Math.sin(phase * .26) * .10
        if (view.core) view.core.scale.setScalar(1 + Math.sin(phase * .8) * .14)
        view.barkBands.forEach((band, index) => {
          band.scale.setScalar(1 + Math.sin(phase * .32 + index * .8) * .025)
        })
        view.shoulders.forEach((shoulder, index) => {
          shoulder.rotation.z = (index === 0 ? -.08 : .08) + Math.sin(phase * .38 + index * Math.PI) * .035
        })
      }
      view.body.position.y = Math.sin(phase * .5) * view.hoverAmplitude
      void delta
    })
  }

  dispose() {
    disposeObjectTree(this.root)
    this.root.removeFromParent()
    this.views.clear()
  }
}
