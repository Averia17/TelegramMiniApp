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
        mesh = new THREE.Mesh(new THREE.RingGeometry(radius * 0.78, radius, 32), material)
        mesh.rotation.x = -Math.PI / 2
        this.meshes.set(id, mesh)
        this.root.add(mesh)
      }
      mesh.position.copy(worldToScene(effect.x, effect.y, 0.8))
      mesh.material.opacity = 0.42 * clamp(effect.life / (effect.maxLife || 0.5))
    })
    this.meshes.forEach((mesh, id) => {
      if (active.has(id)) return
      this.root.remove(mesh)
      disposeObjectTree(mesh)
      this.meshes.delete(id)
    })
  }
}
