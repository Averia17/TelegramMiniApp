import * as THREE from "three"
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js"
import {clone} from "three/addons/utils/SkeletonUtils.js"
import {ENVIRONMENT_ASSETS, HERO_ASSETS, getHeroAsset, resolveHeroName} from "./assetManifest.js"

const loadWith = loader => url => loader.loadAsync(url)

export const normalizeHeroHeight = (root, targetHeight = 2.45) => {
  const excludedRoles = new Set([
    "attack-cloud",
    "companion-cloud",
    "detached-ammo",
    "held-weapon",
    "throwable-weapon",
    "menu-only",
  ])
  const isExcludedRole = role => excludedRoles.has(role)
  root.traverse(node => {
    if (/^HeroAttachment_Cloud$/i.test(node.name)
      && !node.userData.attachment_role
      && !node.userData.attachmentRole) {
      node.userData.attachmentRole = "attack-cloud"
    }
  })
  const getBodyBounds = () => {
    const excluded = []
    root.traverse(node => {
      const role = node.userData.attachment_role || node.userData.attachmentRole
      if (!isExcludedRole(role) || !node.parent) return
      let ancestor = node.parent
      while (ancestor && ancestor !== root) {
        const ancestorRole = ancestor.userData.attachment_role || ancestor.userData.attachmentRole
        if (isExcludedRole(ancestorRole)) return
        ancestor = ancestor.parent
      }
      excluded.push({node, parent: node.parent, index: node.parent.children.indexOf(node)})
    })
    excluded.forEach(({node, parent}) => parent.remove(node))
    root.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(root, true)
    excluded.forEach(({node, parent, index}) => {
      parent.add(node)
      parent.children.splice(parent.children.indexOf(node), 1)
      parent.children.splice(index, 0, node)
    })
    root.updateMatrixWorld(true)
    return bounds
  }
  root.updateMatrixWorld(true)
  const bounds = getBodyBounds()
  const height = bounds.max.y - bounds.min.y
  if (!Number.isFinite(height) || height <= 0.0001) return root
  root.scale.multiplyScalar(targetHeight / height)
  root.updateMatrixWorld(true)
  const normalized = getBodyBounds()
  const bodyCenter = normalized.getCenter(new THREE.Vector3())
  root.position.x -= bodyCenter.x
  root.position.y -= normalized.min.y
  root.position.z -= bodyCenter.z
  root.updateMatrixWorld(true)
  return root
}

const attachWeaponObject = (heroRoot, target, weaponObject, role, name) => {
  heroRoot.updateMatrixWorld(true)
  target.updateWorldMatrix(true, false)
  const rootWorldRotation = heroRoot.getWorldQuaternion(new THREE.Quaternion())
  const socketWorldRotation = target.getWorldQuaternion(new THREE.Quaternion())
  const socketRotationInRoot = rootWorldRotation.invert().multiply(socketWorldRotation)
  const rootWorldScale = heroRoot.getWorldScale(new THREE.Vector3())
  const socketWorldScale = target.getWorldScale(new THREE.Vector3())
  const socketScaleInRoot = socketWorldScale.divide(rootWorldScale)

  const attachment = new THREE.Group()
  attachment.name = `DetachedHeroWeapon.${name}`
  attachment.userData.attachmentRole = role
  attachment.position.set(0, 0, 0)
  attachment.quaternion.copy(socketRotationInRoot).invert()
  attachment.scale.set(
    1 / Math.max(Math.abs(socketScaleInRoot.x), 1e-8),
    1 / Math.max(Math.abs(socketScaleInRoot.y), 1e-8),
    1 / Math.max(Math.abs(socketScaleInRoot.z), 1e-8),
  )
  weaponObject.position.set(0, 0, 0)
  weaponObject.userData.attachmentRole = role
  attachment.add(weaponObject)
  target.add(attachment)
  heroRoot.updateMatrixWorld(true)
  const gripWorld = target.getWorldPosition(new THREE.Vector3())
  const weaponBounds = new THREE.Box3().setFromObject(weaponObject, true)
  if (!weaponBounds.isEmpty() && weaponBounds.distanceToPoint(gripWorld) > .05) {
    const nearestWorld = weaponBounds.clampPoint(gripWorld, new THREE.Vector3())
    const gripLocal = attachment.worldToLocal(gripWorld.clone())
    const nearestLocal = attachment.worldToLocal(nearestWorld)
    weaponObject.position.add(gripLocal.sub(nearestLocal))
    heroRoot.updateMatrixWorld(true)
  }
  return attachment
}

const removeEmbeddedDetachedWeapons = (heroRoot, attachments = []) => {
  const names = new Set(attachments.map(({name}) => name).filter(Boolean))
  if (!names.size) return
  heroRoot.traverse(node => {
    if (!names.has(node.name)) return
    node.parent?.remove(node)
  })
}

export const attachDetachedWeapon = (heroRoot, weaponScene, attachments = []) => {
  if (!weaponScene) return []
  if (attachments.length) {
    return attachments.flatMap(config => {
      const target = heroRoot.getObjectByName(config.target || config.bone)
      const weaponObject = weaponScene.getObjectByName(config.name)
      if (!target || !weaponObject) return []
      return [attachWeaponObject(heroRoot, target, weaponObject, config.role, config.name)]
    })
  }
  const socket = heroRoot.getObjectByName("weapon_socket_r")
  if (!socket) return []
  return [attachWeaponObject(heroRoot, socket, weaponScene, "held-weapon", "Primary")]
}

export class AssetRegistry {
  constructor({manifest = HERO_ASSETS, environmentManifest = ENVIRONMENT_ASSETS, load = null} = {}) {
    this.manifest = manifest
    this.environmentManifest = environmentManifest
    this.load = load || loadWith(new GLTFLoader())
    this.heroLoads = new Map()
    this.weaponLoads = new Map()
    this.readyHeroes = new Set()
    this.environmentLoads = new Map()
  }

  hasHero(name) {
    return Boolean(this.manifest[name]?.available)
  }

  hasEnvironment(visual) {
    return Boolean(this.environmentManifest[visual]?.available)
  }

  loadHero(name) {
    const resolvedName = this.manifest[name] ? name : resolveHeroName(name)
    const asset = this.manifest[resolvedName] || getHeroAsset(resolvedName)
    if (!asset?.available) return Promise.resolve(null)
    if (!this.heroLoads.has(asset.id)) {
      const pending = this.load(asset.url)
        .then(gltf => {
          this.readyHeroes.add(asset.id)
          return gltf
        })
        .catch(error => {
          this.heroLoads.delete(asset.id)
          this.readyHeroes.delete(asset.id)
          throw error
        })
      this.heroLoads.set(asset.id, pending)
    }
    return this.heroLoads.get(asset.id)
  }

  loadHeroWeapon(name) {
    const resolvedName = this.manifest[name] ? name : resolveHeroName(name)
    const asset = this.manifest[resolvedName] || getHeroAsset(resolvedName)
    if (!asset?.weaponUrl) return Promise.resolve(null)
    if (!this.weaponLoads.has(asset.id)) {
      const pending = this.load(asset.weaponUrl).catch(error => {
        this.weaponLoads.delete(asset.id)
        throw error
      })
      this.weaponLoads.set(asset.id, pending)
    }
    return this.weaponLoads.get(asset.id)
  }

  isHeroReady(name) {
    const resolvedName = this.manifest[name] ? name : resolveHeroName(name)
    const asset = this.manifest[resolvedName] || getHeroAsset(resolvedName)
    return Boolean(asset?.available && this.readyHeroes.has(asset.id))
  }

  async preloadHeroes(names, concurrency = 2) {
    const queue = []
    for (const name of [...new Set(names)].filter(heroName => this.hasHero(heroName))) {
      queue.push({label: `${name} model`, load: () => this.loadHero(name)})
    }
    const worker = async () => {
      while (queue.length) {
        const task = queue.shift()
        try {
          await task.load()
        } catch (error) {
          console.warn(`Could not preload hero GLB: ${task.label}`, error)
        }
      }
    }
    const workerCount = Math.min(Math.max(1, concurrency), queue.length)
    await Promise.all(Array.from({length: workerCount}, worker))
  }

  preloadAll(concurrency = 4) {
    return this.preloadHeroes(Object.keys(this.manifest), concurrency)
  }

  async instantiateHero(name) {
    const resolvedName = this.manifest[name] ? name : resolveHeroName(name)
    const asset = this.manifest[resolvedName] || getHeroAsset(resolvedName)
    const [gltf, weaponGltf] = await Promise.all([
      this.loadHero(resolvedName),
      this.loadHeroWeapon(resolvedName),
    ])
    if (!gltf) return null
    const animations = gltf.animations || []
    const root = clone(gltf.scene)
    root.traverse(child => {
      if (Array.isArray(child.material)) child.material = child.material.map(material => material.clone())
      else if (child.material) child.material = child.material.clone()
      if (child.isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    removeEmbeddedDetachedWeapons(root, asset.weaponAttachments)
    if (weaponGltf?.scene) {
      const weaponRoot = clone(weaponGltf.scene)
      weaponRoot.traverse(child => {
        if (Array.isArray(child.material)) child.material = child.material.map(material => material.clone())
        else if (child.material) child.material = child.material.clone()
        if (child.isMesh) {
          child.castShadow = true
          child.receiveShadow = true
        }
      })
      attachDetachedWeapon(root, weaponRoot, asset.weaponAttachments)
    }
    normalizeHeroHeight(root, asset.targetHeight || 2.45)
    root.scale.multiplyScalar(asset.scale)
    root.position.y += asset.groundOffset || 0
    root.rotation.y = asset.rotationOffset
    return {root, animations, asset}
  }

  async instantiateEnvironment(visual) {
    const asset = this.environmentManifest[visual]
    if (!asset?.available) return null
    if (!this.environmentLoads.has(visual)) {
      const pending = this.load(asset.url).catch(error => {
        this.environmentLoads.delete(visual)
        throw error
      })
      this.environmentLoads.set(visual, pending)
    }
    const gltf = await this.environmentLoads.get(visual)
    const root = clone(gltf.scene)
    root.scale.setScalar(asset.scale)
    root.rotation.y = asset.rotationOffset
    return {root, animations: gltf.animations || [], asset}
  }

  clear() {
    this.heroLoads.clear()
    this.weaponLoads.clear()
    this.readyHeroes.clear()
    this.environmentLoads.clear()
  }
}

export const assetRegistry = new AssetRegistry()
