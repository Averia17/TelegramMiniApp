import * as THREE from "three"
import {WORLD_SCALE, worldToScene} from "../shared/coordinates.js"
import {disposeObjectTree} from "../shared/disposal.js"
import {createContactShadow} from "../shared/materials.js"

const BAT_HEIGHT = 22

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
  group.scale.set(2.2, 2.2, 1)
  const background = new THREE.Sprite(new THREE.SpriteMaterial({
    color: 0x28172f,
    depthTest: false,
    depthWrite: false,
  }))
  background.scale.set(.92, .13, 1)
  const fill = new THREE.Sprite(new THREE.SpriteMaterial({
    color: 0xf04f62,
    depthTest: false,
    depthWrite: false,
  }))
  fill.center.set(0, .5)
  fill.scale.set(.8, .072, 1)
  fill.position.set(-.4, -.036, .01)
  fill.userData.fullWidth = .8
  if (typeof document === "undefined") {
    group.add(background, fill)
    group.position.set(0, 1.16, 0)
    group.renderOrder = 18
    return {group, fill, label: null}
  }
  const canvas = document.createElement("canvas")
  canvas.width = 256
  canvas.height = 48
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const label = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  }))
  label.scale.set(1.18, .25, 1)
  label.position.set(0, .14, .02)
  label.userData = {canvas, texture, signature: ""}
  group.add(background, fill, label)
  group.position.set(0, 1.16, 0)
  group.renderOrder = 18
  return {group, fill, label}
}

const updateHealthLabel = (label, state) => {
  if (!label) return
  const text = formatHealthLabel(state.lives, state.maxLives)
  if (label.userData.signature === text) return
  label.userData.signature = text
  const {canvas, texture} = label.userData
  const context = canvas.getContext("2d")
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.textAlign = "center"
  context.textBaseline = "middle"
  context.font = "900 31px Arial"
  context.lineWidth = 8
  context.strokeStyle = "#241329"
  context.strokeText(text, canvas.width / 2, canvas.height / 2)
  context.fillStyle = "#fff"
  context.fillText(text, canvas.width / 2, canvas.height / 2)
  texture.needsUpdate = true
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
  const health = createHealthBar()
  updateHealthLabel(health.label, state)
  group.add(shadow, leftWing, rightWing, body, head, leftEar, rightEar, health.group)

  const visualScale = Math.max(.82, Number(state.radius) * WORLD_SCALE / 1.45)
  group.scale.setScalar(visualScale)
  group.position.copy(worldToScene(state.x, state.y, BAT_HEIGHT))
  return {
    group,
    leftWing,
    rightWing,
    body,
    healthBar: health.group,
    healthFill: health.fill,
    healthLabel: health.label,
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
      view.group.position.copy(worldToScene(state.x, state.y, BAT_HEIGHT))
      view.group.rotation.y = Math.PI / 2 - (Number(state.rotation) || 0)
      const health = Math.max(0, Math.min(1, Number(state.lives) / Math.max(1, Number(state.maxLives))))
      view.healthFill.scale.x = view.healthFill.userData.fullWidth * health
      updateHealthLabel(view.healthLabel, state)
    })
    this.views.forEach((view, id) => {
      if (active.has(id)) return
      this.root.remove(view.group)
      disposeObjectTree(view.group)
      this.views.delete(id)
    })
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
