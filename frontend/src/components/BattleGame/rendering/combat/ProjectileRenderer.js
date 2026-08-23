import * as THREE from "three"
import {WORLD_SCALE, worldToScene} from "../shared/coordinates.js"
import {disposeObjectTree} from "../shared/disposal.js"
import {createContactShadow, flatMaterial} from "../shared/materials.js"
import {endBattlePerformance, startBattlePerformance} from "../shared/performance.js"

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

const standardMaterial = (color, options = {}) => new THREE.MeshStandardMaterial({
  color,
  roughness: 0.62,
  metalness: 0.02,
  ...options,
})

const projectileAccent = kind => {
  const value = String(kind || "").toLowerCase()
  if (value.includes("mina")) return 0xffb8f4
  if (value.includes("zeus")) return 0x9ff5ff
  if (value.includes("lumi")) return 0xf2d2ff
  if (value.includes("katty")) return 0xffb3d4
  if (value.includes("spore")) return 0xdfff74
  return 0xffffff
}

const addProjectileSignature = (group, projectile = {}, held = false) => {
  if (!group?.add || group.userData.projectileSignature) return group
  group.userData.projectileSignature = true
  const accent = new THREE.Color(projectileAccent(projectile.kind))
  const opacity = held ? .22 : .64
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(.43, .028, 7, 28),
    new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  halo.rotation.x = Math.PI / 2
  halo.userData.role = "projectile-halo"
  group.add(halo)

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(.095, 10, 8),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: held ? .24 : .86,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  core.position.y = .06
  core.userData.role = "projectile-core"
  group.add(core)

  const trail = new THREE.Mesh(
    new THREE.ConeGeometry(.055, .30, 6, 1, true),
    new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: held ? .12 : .34,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    }),
  )
  trail.rotation.z = -Math.PI / 2
  trail.position.x = -.20
  trail.userData.role = "projectile-trail"
  group.add(trail)

  for (let index = 0; index < 3; index++) {
    const mote = new THREE.Mesh(
      new THREE.SphereGeometry(.028 + index * .008, 6, 5),
      new THREE.MeshBasicMaterial({
        color: accent,
        transparent: true,
        opacity: held ? .16 : .48,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    const angle = index / 3 * Math.PI * 2
    mote.position.set(Math.cos(angle) * .34, .05 + index * .025, Math.sin(angle) * .34)
    mote.userData.role = "projectile-mote"
    mote.userData.phase = angle
    mote.userData.baseY = mote.position.y
    group.add(mote)
  }
  return group
}

export const createNeedleSporeVisual = (projectile = {}, {held = false} = {}) => {
  const group = new THREE.Group()
  group.name = "NeedleSporeProjectile"
  group.userData.vfxType = "needle-spore"

  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.3, 2),
    standardMaterial(0x5fbd45, {emissive: 0x183d0f, emissiveIntensity: 0.65}),
  )
  core.scale.set(1, 0.9, 1)
  core.userData.role = "core"
  group.add(core)

  const petalGeometry = new THREE.SphereGeometry(0.2, 10, 8)
  const petalMaterial = standardMaterial(0xf05a96, {
    emissive: 0x5b102d,
    emissiveIntensity: 0.55,
  })
  for (let index = 0; index < 6; index += 1) {
    const angle = index * Math.PI / 3
    const petal = new THREE.Mesh(petalGeometry, petalMaterial.clone())
    petal.position.set(Math.cos(angle) * 0.27, 0.15, Math.sin(angle) * 0.27)
    petal.scale.set(0.62, 0.35, 1.18)
    petal.rotation.set(Math.PI / 2, -angle, 0)
    petal.userData.role = "petal"
    group.add(petal)
  }

  const thornGeometry = new THREE.ConeGeometry(0.035, 0.2, 6)
  const thornMaterial = standardMaterial(0xfff0ac, {
    emissive: 0x6e4c10,
    emissiveIntensity: 0.35,
  })
  for (let index = 0; index < 18; index += 1) {
    const longitude = index * 2.399963
    const latitude = Math.acos(1 - 2 * (index + 0.5) / 18)
    const normal = new THREE.Vector3(
      Math.sin(latitude) * Math.cos(longitude),
      Math.cos(latitude),
      Math.sin(latitude) * Math.sin(longitude),
    )
    const thorn = new THREE.Mesh(thornGeometry, thornMaterial)
    thorn.position.copy(normal).multiplyScalar(0.34)
    thorn.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal)
    thorn.userData.role = "thorn"
    group.add(thorn)
  }

  if (!held) {
    const aura = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.025, 6, 32),
      new THREE.MeshBasicMaterial({
        color: projectile.color || 0x75d947,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    aura.rotation.x = Math.PI / 2
    aura.userData.role = "aura"
    group.add(aura)

  }
  return addProjectileSignature(group, projectile, held)
}

export const createProjectileVisual = projectile => {
  if (String(projectile.kind).toLowerCase().includes("spore")) return createNeedleSporeVisual(projectile)
  const kind = String(projectile.kind || "").toLowerCase()
  if (kind.includes("tower_shot")) {
    const shot = new THREE.Group()
    shot.userData.vfxType = "tower-shot"
    const color = projectile.color || 0xff5f6d
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(.27, 12, 8),
      standardMaterial(color, {emissive: color, emissiveIntensity: 1.8, roughness: .28}),
    )
    core.userData.role = "tower-shot-core"
    shot.add(core)
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(.38, .045, 8, 24),
      new THREE.MeshBasicMaterial({color, transparent: true, opacity: .85, depthWrite: false}),
    )
    ring.rotation.x = Math.PI / 2
    ring.userData.role = "tower-shot-ring"
    shot.add(ring)
    const trail = new THREE.Mesh(
      new THREE.ConeGeometry(.15, .72, 8, 1, true),
      new THREE.MeshBasicMaterial({color, transparent: true, opacity: .48, depthWrite: false, side: THREE.DoubleSide}),
    )
    trail.rotation.z = Math.PI / 2
    trail.position.x = -.42
    trail.userData.role = "tower-shot-trail"
    shot.add(trail)
    return addProjectileSignature(shot, projectile)
  }
  if (kind.includes("mina_star")) {
    const orb = new THREE.Group()
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(.26, 16, 12),
      standardMaterial(0x9cecff, {emissive:0x4a9ee8, emissiveIntensity:1.7, transparent:true, opacity:.92}),
    )
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(.34,.035,8,24),
      new THREE.MeshBasicMaterial({color:0xff9bea,transparent:true,opacity:.8,depthWrite:false}),
    )
    ring.rotation.x=Math.PI/2
    orb.add(core,ring)
    orb.userData.vfxType = "fairy-orb"
    return addProjectileSignature(orb, projectile)
  }
  if (kind.includes("katty_paint_spray")) {
    const spray = new THREE.Group()
    spray.userData.vfxType = "katty-paint-spray"
    const can = new THREE.Mesh(
      new THREE.CylinderGeometry(.16, .19, .42, 12),
      standardMaterial(0xff5c9a, {emissive:0x7f174b, emissiveIntensity:1.1}),
    )
    can.rotation.z = Math.PI / 2
    spray.add(can)
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(.20, .20, .07, 12),
      standardMaterial(0xffd2e4, {emissive:0x7a3557, emissiveIntensity:.7}),
    )
    cap.position.y = .22
    cap.rotation.z = Math.PI / 2
    spray.add(cap)
    const mist = new THREE.Mesh(
      new THREE.TorusGeometry(.25, .025, 6, 20),
      new THREE.MeshBasicMaterial({color:0xffd2e4, transparent:true, opacity:.72, depthWrite:false}),
    )
    mist.rotation.x = Math.PI / 2
    mist.userData.role = "spray-mist"
    spray.add(mist)
    return addProjectileSignature(spray, projectile)
  }
  if (kind.includes("zeus_lightning")) {
    const bolt = new THREE.Group()
    bolt.userData.vfxType = "lightning"
    for (let i=0;i<3;i+=1) {
      const segment = new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,.42,6), new THREE.MeshBasicMaterial({color:i%2?0xffffff:0x6bd9ff}))
      segment.position.y=(i-1)*.31
      segment.rotation.z=(i%2?-.28:.28)
      bolt.add(segment)
    }
    return addProjectileSignature(bolt, projectile)
  }
  if (kind.includes("lumi")) {
    const orb = new THREE.Group()
    orb.userData.vfxType = "lumi-orb"
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(.26, 1), standardMaterial(0xffd7f5,{emissive:0x9e297d,emissiveIntensity:1.7}))
    orb.add(core)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.34,.028,8,28), new THREE.MeshBasicMaterial({color:0xff8fd5,transparent:true,opacity:.8,depthWrite:false}))
    ring.rotation.x = Math.PI / 2
    ring.userData.role = "lumi-orb-ring"
    orb.add(ring)
    for (let index = 0; index < 4; index += 1) {
      const petal = new THREE.Mesh(new THREE.SphereGeometry(.12,8,6), standardMaterial(index % 2 ? 0xd954a8 : 0xff9bda, {emissive:0x7b164f, emissiveIntensity:.8}))
      const angle = index * Math.PI / 2
      petal.position.set(Math.cos(angle) * .28, 0, Math.sin(angle) * .28)
      petal.scale.set(1.2, .45, .65)
      petal.userData.role = "lumi-orb-petal"
      orb.add(petal)
    }
    return addProjectileSignature(orb, projectile)
  }
  const geometry = new THREE.SphereGeometry(clamp((projectile.radius || 5) * WORLD_SCALE, 0.12, 0.42), 8, 6)
  return addProjectileSignature(new THREE.Mesh(geometry, flatMaterial(projectile.color || 0xffdf66)), projectile)
}

const createSporeBurst = position => {
  const burst = new THREE.Group()
  burst.position.copy(position)
  burst.userData.life = 0.52
  burst.userData.duration = 0.52
  const thornGeometry = new THREE.ConeGeometry(0.055, 0.42, 7)
  const thornMaterial = standardMaterial(0xffef9f, {emissive: 0x6d4710, emissiveIntensity: 0.5})
  for (let index = 0; index < 6; index += 1) {
    const angle = index * Math.PI / 3
    const thorn = new THREE.Mesh(thornGeometry, thornMaterial)
    thorn.rotation.z = Math.PI / 2
    thorn.rotation.y = -angle
    thorn.userData.velocity = new THREE.Vector3(Math.cos(angle) * 5.2, 1.3, Math.sin(angle) * 5.2)
    burst.add(thorn)
  }
  for (let index = 0; index < 14; index += 1) {
    const mote = new THREE.Mesh(
      new THREE.SphereGeometry(0.025 + index % 3 * 0.012, 5, 4),
      new THREE.MeshBasicMaterial({color: index % 2 ? 0xff68ad : 0xb7ff63}),
    )
    const angle = index * 2.399963
    mote.userData.velocity = new THREE.Vector3(Math.cos(angle) * (1.5 + index % 4), 1.1 + index % 5 * 0.35, Math.sin(angle) * (1.5 + index % 4))
    burst.add(mote)
  }
  return burst
}

export class ProjectileRenderer {
  constructor(root) {
    this.root = root
    this.meshes = new Map()
    this.bursts = []
  }

  sync(projectiles) {
    const perfToken = startBattlePerformance("projectiles.sync")
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
      this.updateMesh(mesh, projectile)
    })
    this.meshes.forEach((mesh, id) => {
      if (active.has(id)) return
      if (mesh.userData.vfxType === "needle-spore") {
        const burst = createSporeBurst(mesh.position)
        this.bursts.push(burst)
        this.root.add(burst)
      }
      this.root.remove(mesh, mesh.userData.shadow)
      disposeObjectTree(mesh)
      disposeObjectTree(mesh.userData.shadow)
      this.meshes.delete(id)
    })
    endBattlePerformance(perfToken)
  }

  updateMesh(mesh, projectile) {
    mesh.position.copy(worldToScene(projectile.x, projectile.y, 24 + (projectile.z || 0)))
    const shadow = mesh.userData.shadow
    if (!shadow?.position) return
    shadow.position.copy(worldToScene(projectile.x, projectile.y, 0.5))
    const flight = clamp((projectile.z || 0) / 90, 0, 1)
    shadow.scale.setScalar(1 - flight * 0.55)
    if (shadow.material) shadow.material.opacity = 0.22 * (1 - flight * 0.65)
  }

  setDisplayState(projectiles = []) {
    const perfToken = startBattlePerformance("projectiles.display")
    projectiles.forEach((projectile, index) => {
      const id = String(projectile.id ?? `${projectile.playerId}:${index}`)
      const mesh = this.meshes.get(id)
      if (mesh) this.updateMesh(mesh, projectile)
    })
    endBattlePerformance(perfToken)
  }

  create(projectile) {
    const mesh = createProjectileVisual(projectile)
    mesh.userData.shadow = createContactShadow(0.45)
    return mesh
  }

  update(delta, time) {
    this.meshes.forEach(mesh => {
      mesh.rotation.y += delta * 7
      mesh.rotation.z += delta * 4
      mesh.traverse(child => {
        const role = child.userData?.role
        if (role === "projectile-halo") {
          child.rotation.z += delta * 6
          child.scale.setScalar(.94 + Math.sin(time * 14) * .08)
        }
        if (role === "projectile-core") {
          child.scale.setScalar(.88 + Math.sin(time * 18) * .14)
        }
        if (role === "projectile-trail") {
          child.scale.x = .88 + Math.sin(time * 16) * .18
          child.material.opacity = .24 + Math.sin(time * 13) * .08
        }
        if (role === "projectile-mote") {
          const angle = (child.userData.phase || 0) + time * 5.5
          child.position.x = Math.cos(angle) * .34
          child.position.z = Math.sin(angle) * .34
          child.position.y = child.userData.baseY + Math.sin(time * 12 + angle) * .035
        }
      })
      if (mesh.userData.vfxType !== "needle-spore") return
      const pulse = 1 + Math.sin(time * 16) * 0.07
      mesh.scale.setScalar(pulse)
      const aura = mesh.children.find(child => child.userData.role === "aura")
      if (aura) {
        aura.rotation.z -= delta * 5
        aura.material.opacity = 0.42 + Math.sin(time * 19) * 0.16
      }
    })
    this.bursts = this.bursts.filter(burst => {
      burst.userData.life -= delta
      const progress = 1 - burst.userData.life / burst.userData.duration
      burst.children.forEach(child => {
        child.position.addScaledVector(child.userData.velocity, delta)
        child.userData.velocity.y -= 4.5 * delta
        child.rotation.x += delta * 9
        child.scale.setScalar(Math.max(0.02, 1 - progress))
      })
      if (burst.userData.life > 0) return true
      this.root.remove(burst)
      disposeObjectTree(burst)
      return false
    })
  }
}
