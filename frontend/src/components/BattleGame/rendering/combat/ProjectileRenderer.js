import * as THREE from "three"
import {WORLD_SCALE, worldToScene} from "../shared/coordinates"
import {disposeObjectTree} from "../shared/disposal"
import {createContactShadow, flatMaterial} from "../shared/materials"

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

export class ProjectileRenderer {
  constructor(root) {
    this.root = root
    this.meshes = new Map()
  }

  sync(projectiles) {
    const active = new Set()
    projectiles.forEach((projectile, index) => {
      const id = String(projectile.id ?? `${projectile.playerId}:${index}`)
      active.add(id)
      let mesh = this.meshes.get(id)
      if (!mesh) {
        mesh = this.create(projectile)
        this.meshes.set(id, mesh)
        this.root.add(mesh, mesh.userData.shadow)
      }
      mesh.position.copy(worldToScene(projectile.x, projectile.y, 24 + (projectile.z || 0)))
      mesh.rotation.z += 0.22
      mesh.userData.shadow.position.copy(worldToScene(projectile.x, projectile.y, 0.5))
      const flight = clamp((projectile.z || 0) / 90, 0, 1)
      mesh.userData.shadow.scale.setScalar(1 - flight * 0.55)
      mesh.userData.shadow.material.opacity = 0.22 * (1 - flight * 0.65)
    })
    this.meshes.forEach((mesh, id) => {
      if (active.has(id)) return
      this.root.remove(mesh, mesh.userData.shadow)
      disposeObjectTree(mesh)
      disposeObjectTree(mesh.userData.shadow)
      this.meshes.delete(id)
    })
  }

  create(projectile) {
    const bottle = String(projectile.kind).includes("barley")
    const geometry = bottle
      ? new THREE.CylinderGeometry(0.2, 0.25, 0.65, 8)
      : new THREE.SphereGeometry(clamp((projectile.radius || 5) * WORLD_SCALE, 0.12, 0.42), 8, 6)
    const mesh = new THREE.Mesh(geometry, flatMaterial(projectile.color || (bottle ? 0x62b9ff : 0xffdf66)))
    mesh.userData.shadow = createContactShadow(0.45)
    return mesh
  }
}
