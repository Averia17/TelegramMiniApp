import * as THREE from "three"
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js"
import {clone} from "three/addons/utils/SkeletonUtils.js"
import {ENVIRONMENT_ASSETS, HERO_ASSETS, getHeroAsset} from "./assetManifest.js"

const loadWith = loader => url => loader.loadAsync(url)

export const normalizeHeroHeight = (root, targetHeight = 2.45) => {
  root.updateMatrixWorld(true)
  const bounds = new THREE.Box3().setFromObject(root)
  const height = bounds.max.y - bounds.min.y
  if (!Number.isFinite(height) || height <= 0.0001) return root
  root.scale.multiplyScalar(targetHeight / height)
  root.updateMatrixWorld(true)
  const normalized = new THREE.Box3().setFromObject(root)
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
      const pending = this.load(asset.url).catch(error => {
        this.heroLoads.delete(asset.id)
        throw error
      })
      this.heroLoads.set(asset.id, pending)
    }
    return this.heroLoads.get(asset.id)
  }

  async instantiateHero(name) {
    const asset = this.manifest[name] || getHeroAsset(name)
    const gltf = await this.loadHero(name)
    if (!gltf) return null
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
    root.rotation.y = asset.rotationOffset
    return {root, animations: gltf.animations || [], asset}
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
    this.environmentLoads.clear()
  }
}

export const assetRegistry = new AssetRegistry()
