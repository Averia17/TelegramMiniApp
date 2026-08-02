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

export const normalizeEnvironmentRoot = (root, targetHeight = null) => {
  root.updateMatrixWorld(true)
  const bounds = new THREE.Box3().setFromObject(root, true)
  if (bounds.isEmpty()) return root
  const size = bounds.getSize(new THREE.Vector3())
  if (targetHeight && Number.isFinite(targetHeight) && size.y > 0.0001) {
    root.scale.multiplyScalar(targetHeight / size.y)
    root.updateMatrixWorld(true)
  }
  const normalized = new THREE.Box3().setFromObject(root, true)
  const center = normalized.getCenter(new THREE.Vector3())
  root.position.x -= center.x
  root.position.y -= normalized.min.y
  root.position.z -= center.z
  root.updateMatrixWorld(true)
  return root
}

const applyEnvironmentMaterial = (root, asset) => {
  if (!asset.unlit && asset.materialColor == null) return
  root.traverse(node => {
    if (!node.isMesh || !node.material) return
    const wasArray = Array.isArray(node.material)
    const materials = wasArray ? node.material : [node.material]
    const nextMaterials = materials.map(material => {
      if (!asset.unlit) {
        const cloned = material.clone()
        if (asset.materialColor != null && cloned.color) cloned.color.set(asset.materialColor)
        return cloned
      }
      return new THREE.MeshBasicMaterial({
        alphaTest: material.alphaTest,
        color: asset.materialColor ?? material.color,
        depthTest: material.depthTest,
        depthWrite: material.depthWrite,
        map: material.map,
        opacity: material.opacity,
        side: THREE.DoubleSide,
        transparent: material.transparent,
        vertexColors: material.vertexColors,
      })
    })
    node.material = wasArray ? nextMaterials : nextMaterials[0]
  })
}

export const attachCompanionCloud = (heroRoot, cloudScene) => {
  if (!heroRoot || !cloudScene) return null
  const target = heroRoot.getObjectByName("Root") || heroRoot
  const cloud = cloudScene
  // Preserve the glTF root name "Cloud" so companion animation tracks such
  // as Cloud.position remain addressable by a dedicated AnimationMixer.
  if (!/^Cloud$/i.test(cloud.name)) cloud.name = "HeroAttachment_Cloud"
  cloud.userData.attachmentRole = "companion-cloud"
  cloud.traverse(node => {
    node.userData.attachmentRole = "companion-cloud"
  })
  target.add(cloud)
  cloud.position.set(0, 0, 0)
  cloud.rotation.set(0, 0, 0)
  cloud.updateMatrixWorld(true)
  const bounds = new THREE.Box3().setFromObject(cloud, true)
  const size = bounds.getSize(new THREE.Vector3())
  const extent = Math.max(size.x, size.y, size.z)
  if (Number.isFinite(extent) && extent > .001) cloud.scale.multiplyScalar(.64 / extent)
  cloud.updateMatrixWorld(true)
  const centerWorld = new THREE.Box3().setFromObject(cloud, true).getCenter(new THREE.Vector3())
  const targetWorld = target.localToWorld(new THREE.Vector3(.58, 1.32, -.10))
  cloud.position.add(cloud.parent.worldToLocal(targetWorld).sub(cloud.parent.worldToLocal(centerWorld)))
  cloud.userData.attachmentRole = "companion-cloud"
  return cloud
}

export class AssetRegistry {
  constructor({manifest = HERO_ASSETS, environmentManifest = ENVIRONMENT_ASSETS, load = null} = {}) {
    this.manifest = manifest
    this.environmentManifest = environmentManifest
    this.load = load || loadWith(new GLTFLoader())
    this.heroLoads = new Map()
    this.companionLoads = new Map()
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

  loadHeroCompanion(name) {
    const resolvedName = this.manifest[name] ? name : resolveHeroName(name)
    const asset = this.manifest[resolvedName] || getHeroAsset(resolvedName)
    if (!asset?.companionUrl) return Promise.resolve(null)
    if (!this.companionLoads.has(asset.id)) {
      const pending = this.load(asset.companionUrl).catch(error => {
        this.companionLoads.delete(asset.id)
        throw error
      })
      this.companionLoads.set(asset.id, pending)
    }
    return this.companionLoads.get(asset.id)
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
    const [gltf, companionGltf] = await Promise.all([
      this.loadHero(resolvedName),
      this.loadHeroCompanion(resolvedName),
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
    if (companionGltf?.scene) {
      const cloudRoot = clone(companionGltf.scene)
      cloudRoot.traverse(child => {
        if (Array.isArray(child.material)) child.material = child.material.map(material => material.clone())
        else if (child.material) child.material = child.material.clone()
        if (child.isMesh) {
          child.castShadow = true
          child.receiveShadow = true
        }
      })
      attachCompanionCloud(root, cloudRoot)
    }
    normalizeHeroHeight(root, asset.targetHeight || 2.45)
    root.scale.multiplyScalar(asset.scale)
    root.position.y += asset.groundOffset || 0
    root.rotation.y = asset.rotationOffset
    return {root, animations, companionAnimations: companionGltf?.animations || [], asset}
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
    const sourceRoot = clone(gltf.scene)
    const root = asset.includeNodes?.length
      ? this.extractEnvironmentNodes(sourceRoot, asset.includeNodes)
      : sourceRoot
    root.scale.setScalar(asset.scale)
    root.rotation.y = asset.rotationOffset
    normalizeEnvironmentRoot(root, asset.targetHeight)
    applyEnvironmentMaterial(root, asset)
    return {root, animations: gltf.animations || [], asset}
  }

  extractEnvironmentNodes(root, names) {
    root.updateMatrixWorld(true)
    const selected = new THREE.Group()
    selected.name = `${root.name}:selected`
    names.forEach(name => {
      const node = root.getObjectByName(name)
      if (!node) return
      const nodeClone = clone(node)
      const position = new THREE.Vector3()
      const quaternion = new THREE.Quaternion()
      const scale = new THREE.Vector3()
      node.matrixWorld.decompose(position, quaternion, scale)
      nodeClone.position.copy(position)
      nodeClone.quaternion.copy(quaternion)
      nodeClone.scale.copy(scale)
      selected.add(nodeClone)
    })
    return selected
  }

  clear() {
    this.heroLoads.clear()
    this.companionLoads.clear()
    this.readyHeroes.clear()
    this.environmentLoads.clear()
  }
}

export const assetRegistry = new AssetRegistry()
