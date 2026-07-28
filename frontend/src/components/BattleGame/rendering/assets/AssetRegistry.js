import * as THREE from "three"
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js"
import {clone} from "three/addons/utils/SkeletonUtils.js"
import {ENVIRONMENT_ASSETS, HERO_ASSETS, getHeroAsset} from "./assetManifest.js"

const loadWith = loader => url => loader.loadAsync(url)

export const normalizeHeroHeight = (root, targetHeight = 2.45) => {
  const excludedRoles = new Set(["attack-cloud", "companion-cloud", "detached-ammo", "menu-only"])
  const isExcludedRole = role => excludedRoles.has(role)
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
  root.position.y -= normalized.min.y
  root.updateMatrixWorld(true)
  return root
}

export class AssetRegistry {
  constructor({manifest = HERO_ASSETS, environmentManifest = ENVIRONMENT_ASSETS, load = null} = {}) {
    this.manifest = manifest
    this.environmentManifest = environmentManifest
    this.load = load || loadWith(new GLTFLoader())
    this.heroLoads = new Map()
    this.eventAnimationLoads = new Map()
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
    const asset = this.manifest[name] || getHeroAsset(name)
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

  loadEventAnimation(eventAsset) {
    if (!eventAsset?.url) return Promise.resolve([])
    if (!this.eventAnimationLoads.has(eventAsset.url)) {
      const pending = this.load(eventAsset.url)
        .then(gltf => gltf.animations || [])
        .catch(error => {
          this.eventAnimationLoads.delete(eventAsset.url)
          throw error
        })
      this.eventAnimationLoads.set(eventAsset.url, pending)
    }
    return this.eventAnimationLoads.get(eventAsset.url)
  }

  async loadHeroEventAnimations(asset) {
    const entries = Object.values(asset.eventAnimations || {})
    if (!entries.length) return []
    const clipGroups = await Promise.all(entries.map(eventAsset => this.loadEventAnimation(eventAsset)))
    return clipGroups.flat()
  }

  isHeroReady(name) {
    const asset = this.manifest[name] || getHeroAsset(name)
    return Boolean(asset?.available && this.readyHeroes.has(asset.id))
  }

  async preloadHeroes(names, concurrency = 2) {
    const queue = []
    for (const name of [...new Set(names)].filter(heroName => this.hasHero(heroName))) {
      const asset = this.manifest[name] || getHeroAsset(name)
      queue.push({label: `${name} model`, load: () => this.loadHero(name)})
      for (const eventAsset of Object.values(asset.eventAnimations || {})) {
        queue.push({
          label: `${name} ${eventAsset.clip || "event"}`,
          load: () => this.loadEventAnimation(eventAsset),
        })
      }
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
    const asset = this.manifest[name] || getHeroAsset(name)
    const gltf = await this.loadHero(name)
    if (!gltf) return null
    const baseAnimations = gltf.animations || []
    const eventAnimations = await this.loadHeroEventAnimations(asset)
    const root = clone(gltf.scene)
    root.traverse(child => {
      if (Array.isArray(child.material)) child.material = child.material.map(material => material.clone())
      else if (child.material) child.material = child.material.clone()
      if (child.isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    normalizeHeroHeight(root, asset.targetHeight || 2.45)
    root.scale.multiplyScalar(asset.scale)
    root.position.y += asset.groundOffset || 0
    root.rotation.y = asset.rotationOffset
    const eventNames = new Set(Object.values(asset.eventAnimations || {}).map(event => event.clip))
    const locomotionAnimations = baseAnimations.filter(clip => !eventNames.has(clip.name))
    return {root, animations: [...locomotionAnimations, ...eventAnimations], asset}
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
    this.eventAnimationLoads.clear()
    this.readyHeroes.clear()
    this.environmentLoads.clear()
  }
}

export const assetRegistry = new AssetRegistry()
