import * as THREE from "three"
import {WORLD_SCALE, worldToScene} from "../shared/coordinates.js"
import {disposeObjectTree} from "../shared/disposal.js"
import {flatMaterial} from "../shared/materials.js"
import {collectNewCombatHits, resolveCombatTargetPosition} from "./combatFeedback.js"
import {battleCanvasFont} from "../../battleTypography.js"

const FEEDBACK_LIFE = .62
const clamp01 = value => Math.max(0, Math.min(1, value))

const createDamageTexture = damage => {
  if (typeof document === "undefined") return null
  const canvas = document.createElement("canvas")
  canvas.width = 192
  canvas.height = 96
  const context = canvas.getContext("2d")
  if (!context) return null
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.textAlign = "center"
  context.textBaseline = "middle"
  context.font = battleCanvasFont(900, 54)
  context.lineJoin = "round"
  context.lineWidth = 11
  context.strokeStyle = "rgba(32, 18, 53, .92)"
  context.fillStyle = "#fff8d7"
  const label = String(Math.max(0, Math.round(Number(damage) || 0)))
  context.strokeText(label, canvas.width / 2, canvas.height / 2 + 2)
  context.fillText(label, canvas.width / 2, canvas.height / 2 + 2)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

const createHitBurst = (radius, color) => {
  const group = new THREE.Group()
  group.userData.role = "combat-hit-feedback"
  const material = flatMaterial(color, {
    transparent: true,
    opacity: .95,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
  })
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius * .36, radius * .72, 24), material)
  ring.rotation.x = -Math.PI / 2
  ring.userData.role = "hit-ring"
  group.add(ring)
  for (let index = 0; index < 6; index++) {
    const shard = new THREE.Mesh(
      new THREE.BoxGeometry(radius * .62, radius * .12, radius * .12),
      material.clone(),
    )
    const angle = index / 6 * Math.PI * 2
    shard.position.set(Math.cos(angle) * radius * .72, radius * .28, Math.sin(angle) * radius * .72)
    shard.rotation.y = -angle
    shard.userData.role = "hit-shard"
    group.add(shard)
  }
  return group
}

export class CombatFeedbackRenderer {
  constructor(root) {
    this.root = root
    this.feedback = new Map()
    this.seenIds = new Set()
    this.state = null
    this.localPlayerId = null
  }

  setLocalPlayerId(id) {
    this.localPlayerId = String(id || "")
  }

  spawn(event, position) {
    const targetIsLocal = String(event.targetId) === this.localPlayerId
    const sourceIsLocal = String(event.sourceId) === this.localPlayerId
    const color = targetIsLocal ? 0xff5c72 : sourceIsLocal ? 0xffd84d : 0xfff4e8
    const radius = Math.max(12, position.radius) * WORLD_SCALE
    const group = createHitBurst(radius, color)
    group.position.copy(worldToScene(position.x, position.y, 2))
    group.userData.eventId = String(event.id)
    group.userData.damage = Number(event.damage) || 0
    group.userData.targetId = String(event.targetId || "")
    group.userData.targetType = String(event.targetType || "players")

    const texture = createDamageTexture(event.damage)
    const label = new THREE.Sprite(new THREE.SpriteMaterial({
      color,
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }))
    label.position.y = 5.2
    label.scale.set(3.8, 1.9, 1)
    label.renderOrder = 30
    label.userData.role = "damage-number"
    group.userData.damageNumber = label
    group.add(label)
    this.root.add(group)
    this.feedback.set(String(event.id), {
      event,
      group,
      position,
      age: 0,
    })
  }

  sync(state) {
    this.state = state
    const {hits, seenIds} = collectNewCombatHits(state?.combatEvents, this.seenIds)
    const visibleHits = []
    hits.forEach(event => {
      const position = resolveCombatTargetPosition(event, state)
      if (position) {
        this.spawn(event, position)
        visibleHits.push(event)
      } else {
        // A compact/interpolated snapshot may arrive before the target entity.
        // Keep the event eligible for the next authoritative snapshot instead
        // of permanently dropping the only confirmed hit presentation.
        seenIds.delete(String(event.id))
      }
    })
    this.seenIds = seenIds
    return visibleHits
  }

  update(delta) {
    this.feedback.forEach((entry, id) => {
      entry.age += delta
      const progress = clamp01(entry.age / FEEDBACK_LIFE)
      const position = resolveCombatTargetPosition(entry.event, this.state) || entry.position
      entry.position = position
      entry.group.position.copy(worldToScene(position.x, position.y, 2))
      entry.group.scale.setScalar(.72 + progress * 1.08)
      entry.group.children.forEach(child => {
        if (child.userData.role === "damage-number") {
          child.position.y = 5.2 + progress * 1.15
        }
        if (child.material) child.material.opacity = 1 - progress
      })
      if (progress >= 1) {
        const label = entry.group.userData.damageNumber
        label?.material?.map?.dispose?.()
        this.root.remove(entry.group)
        disposeObjectTree(entry.group)
        this.feedback.delete(id)
      }
    })
  }

  dispose() {
    this.feedback.forEach(entry => {
      entry.group.userData.damageNumber?.material?.map?.dispose?.()
      this.root.remove(entry.group)
      disposeObjectTree(entry.group)
    })
    this.feedback.clear()
    this.seenIds.clear()
    this.state = null
  }
}
