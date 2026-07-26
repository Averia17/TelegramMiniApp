import * as THREE from "three"
import {WORLD_SCALE, worldToScene} from "../shared/coordinates"
import {disposeObjectTree} from "../shared/disposal"
import {flatMaterial} from "../shared/materials"

const clamp = value => Math.max(0, Math.min(1, value))

export class EffectRenderer {
  constructor(root) {
    this.root = root
    this.meshes = new Map()
  }

  sync(effects) {
    const active = new Set()
    effects.forEach((effect, index) => {
      const id = String(effect.id || `${effect.kind}:${index}`)
      active.add(id)
      let mesh = this.meshes.get(id)
      if (!mesh) {
        const radius = Math.max(12, effect.radius || effect.range * 0.18 || 30) * WORLD_SCALE
        const material = flatMaterial(effect.color || 0xffffff, {
          transparent: true,
          opacity: 0.42,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
        if (effect.kind === "damian_totem") {
          mesh = new THREE.Group()
          const base = new THREE.Mesh(new THREE.CylinderGeometry(radius*.55,radius*.75,radius*1.8,8), material)
          base.position.y=radius*.9
          const eye = new THREE.Mesh(new THREE.IcosahedronGeometry(radius*.42,1), flatMaterial(0xb45cff))
          eye.position.y=radius*2
          mesh.add(base,eye,new THREE.PointLight(0x9c45ff,1.4,3))
          mesh.userData.kind=effect.kind
        } else if (effect.kind === "mandy_super_wave") {
          mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 24, 1), material)
          mesh.userData.kind = effect.kind
        } else if (effect.kind === "mandy_staff_swing") {
          mesh = new THREE.Mesh(new THREE.RingGeometry(radius * .62, radius, 36, 1, -effect.arc, effect.arc * 2), material)
          mesh.userData.kind = effect.kind
        } else {
          mesh = new THREE.Mesh(new THREE.RingGeometry(radius * 0.78, radius, 32), material)
        }
        mesh.rotation.x = -Math.PI / 2
        this.meshes.set(id, mesh)
        this.root.add(mesh)
      }
      if (mesh.userData.kind === "damian_totem") {
        mesh.position.copy(worldToScene(effect.x,effect.y,0))
        mesh.rotation.y += .03
      } else if (mesh.userData.kind === "mandy_super_wave") {
        const range = Math.max(1, effect.range || Math.hypot((effect.toX || effect.x) - effect.x, (effect.toY || effect.y) - effect.y))
        mesh.position.copy(worldToScene(
          effect.x + Math.cos(effect.angle || 0) * range / 2,
          effect.y + Math.sin(effect.angle || 0) * range / 2,
          2,
        ))
        mesh.rotation.y = -(effect.angle || 0)
        mesh.scale.set(range * WORLD_SCALE, Math.max(100, (effect.radius || 50) * 2) * WORLD_SCALE, 1)
      } else {
        mesh.position.copy(worldToScene(effect.x, effect.y, 0.8))
        if (mesh.userData.kind === "mandy_staff_swing") mesh.rotation.y = -(effect.angle || 0)
      }
      if(mesh.material)mesh.material.opacity = 0.42 * clamp(effect.life / (effect.maxLife || 0.5))
    })
    this.meshes.forEach((mesh, id) => {
      if (active.has(id)) return
      this.root.remove(mesh)
      disposeObjectTree(mesh)
      this.meshes.delete(id)
    })
  }
}
