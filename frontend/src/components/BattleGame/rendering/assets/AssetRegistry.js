import * as THREE from "three"
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js"
import {clone} from "three/addons/utils/SkeletonUtils.js"
import {mergeGeometries} from "three/addons/utils/BufferGeometryUtils.js"
import {HERO_ASSETS, getHeroAsset, resolveHeroName} from "./assetManifest.js"

// Keep fetched GLB response buffers in Three.js' process-local cache. This
// survives route/component changes and is cleared naturally on a full reload.
THREE.Cache.enabled = true

const loadWith = loader => url => loader.loadAsync(url)
const runtimeAssetUrl = (asset, url) => asset?.cacheBust
  ? `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(asset.cacheBust)}`
  : url

const cloneMaterials = root => root.traverse(child => {
  if (Array.isArray(child.material)) child.material = child.material.map(material => material.clone())
  else if (child.material) child.material = child.material.clone()
})

const COMPANION_CLOUD_COLOR = 0xc8e7ff

const createCompanionCloudMaterial = source => {
  source?.dispose?.()
  return new THREE.MeshStandardMaterial({
    color: COMPANION_CLOUD_COLOR,
    metalness: 0,
    roughness: .82,
  })
}

const prepareCompanionCloudMaterial = root => root.traverse(child => {
  if (!child.isMesh) return
  if (Array.isArray(child.material)) {
    child.material = child.material.map(material => createCompanionCloudMaterial(material))
  } else {
    child.material = createCompanionCloudMaterial(child.material)
  }
})

const markSharedGeometry = root => root.traverse(child => {
  if (child.geometry) child.geometry.userData.assetRegistryShared = true
})

const ATTACHMENT_ROLES = new Set([
  "attack-cloud",
  "companion-cloud",
  "detached-ammo",
  "held-weapon",
  "throwable-weapon",
  "menu-only",
])

const hasProtectedAncestor = node => {
  let current = node
  while (current) {
    const role = current.userData?.attachment_role || current.userData?.attachmentRole
    if (ATTACHMENT_ROLES.has(role) || current.name === "SpawnCactus") return true
    current = current.parent
  }
  return false
}

const materialKey = material => [
  material?.type,
  material?.color?.getHex?.() ?? null,
  material?.emissive?.getHex?.() ?? null,
  material?.emissiveIntensity ?? null,
  material?.roughness ?? null,
  material?.metalness ?? null,
  material?.opacity ?? null,
  material?.transparent ?? false,
  material?.alphaTest ?? 0,
  material?.side ?? null,
  material?.vertexColors ?? false,
  material?.map?.uuid ?? null,
  material?.normalMap?.uuid ?? null,
  material?.alphaMap?.uuid ?? null,
].join(":")

const geometryKey = geometry => [
  Object.keys(geometry.attributes).sort().join(","),
  geometry.index?.array?.constructor?.name || "no-index",
  Object.keys(geometry.morphAttributes || {}).sort().join(","),
].join("|")

const canMergeMesh = mesh => Boolean(
  mesh?.isMesh &&
  !Array.isArray(mesh.material) &&
  mesh.material &&
  mesh.geometry?.attributes?.position &&
  !hasProtectedAncestor(mesh),
)

const mergeMeshGroup = (meshes, parent) => {
  if (meshes.length < 2) return null
  const first = meshes[0]
  const geometries = []
  try {
    meshes.forEach(mesh => {
      const geometry = mesh.geometry.clone()
      geometry.applyMatrix4(mesh.matrix)
      geometry.clearGroups()
      geometries.push(geometry)
    })
    const mergedGeometry = mergeGeometries(geometries, false)
    if (!mergedGeometry) {
      geometries.forEach(geometry => geometry.dispose())
      return null
    }
    const merged = first.isSkinnedMesh
      ? new THREE.SkinnedMesh(mergedGeometry, first.material)
      : new THREE.Mesh(mergedGeometry, first.material)
    merged.name = `${parent.name || "hero"}:merged:${first.material.name || first.material.type}`
    merged.castShadow = first.castShadow
    merged.receiveShadow = first.receiveShadow
    if (first.isSkinnedMesh) merged.bind(first.skeleton, first.bindMatrix)
    parent.add(merged)
    meshes.forEach(mesh => {
      mesh.parent?.remove(mesh)
      if (mesh !== first) {
        const material = mesh.material
        if (material && material !== first.material) material.dispose?.()
      }
    })
    return merged
  } catch {
    geometries.forEach(geometry => geometry.dispose())
    return null
  }
}

/**
 * Collapse the many tiny authored parts exported by some heroes into meshes
 * that share one material, parent transform, and (when skinned) skeleton.
 * Skin attributes are preserved, so the GLB animation still drives every
 * vertex. Attachments and spawn helpers stay separate because runtime code
 * addresses them by node name/role.
 */
export const mergeHeroRenderParts = root => {
  if (!root) return {before: 0, after: 0, mergedGroups: 0}
  const meshes = []
  root.traverse(node => { if (canMergeMesh(node)) meshes.push(node) })
  const before = meshes.length
  const groups = new Map()
  meshes.forEach(mesh => {
    const parent = mesh.parent
    // GLTFLoader may create a different Skeleton wrapper for each mesh while
    // all wrappers still reference the same bone objects. Group by the bones,
    // not by Skeleton.uuid, or the exporter fragmentation survives merging.
    const skeletonKey = mesh.isSkinnedMesh
      ? mesh.skeleton?.bones?.map(bone => bone.uuid).join(",") || "no-skeleton"
      : "static"
    const key = `${parent?.uuid || "root"}|${skeletonKey}|${materialKey(mesh.material)}|${geometryKey(mesh.geometry)}`
    const group = groups.get(key)
    if (group) group.push(mesh)
    else groups.set(key, [mesh])
  })
  let mergedGroups = 0
  groups.forEach(group => {
    if (mergeMeshGroup(group, group[0].parent)) mergedGroups += 1
  })
  let after = 0
  root.traverse(node => { if (node.isMesh) after += 1 })
  return {before, after, mergedGroups}
}

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

const attachCompanionCloud = (heroRoot, cloudScene) => {
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
  // Normalize the companion in its own scene space before parenting it to a
  // deforming hero bone. Box3.setFromObject() on a skinned mesh can include
  // the parent's bone/world transform after attachment and produce a huge
  // bogus center, which sends the cloud far away from the hero in battle.
  cloud.position.set(0, 0, 0)
  cloud.rotation.set(0, 0, 0)
  cloud.updateMatrixWorld(true)
  const bounds = new THREE.Box3().setFromObject(cloud, true)
  const size = bounds.getSize(new THREE.Vector3())
  const extent = Math.max(size.x, size.y, size.z)
  // The hero is normalized after import and carries the gameplay scale on
  // the armature parent. Use a larger authoring-space extent so the cloud
  // remains readable above the hero instead of shrinking to a tiny mote.
  if (Number.isFinite(extent) && extent > .001) cloud.scale.multiplyScalar(2.4 / extent)
  target.add(cloud)
  // Compute the center after parenting, but convert it back through the
  // actual target bone. This avoids mixing the detached GLTF scene matrix
  // with the hero's deforming Root matrix.
  cloud.position.set(0, 0, 0)
  cloud.updateMatrixWorld(true)
  const centerWorld = new THREE.Box3().setFromObject(cloud, true).getCenter(new THREE.Vector3())
  const centerLocal = target.worldToLocal(centerWorld)
  // Keep the companion clearly airborne: x offsets it to the hero's right,
  // while y places it above the head rather than level with the face.
  const targetWorld = heroRoot.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(.95, 2.95, -.08))
  const targetLocal = target.worldToLocal(targetWorld)
  cloud.position.copy(targetLocal.sub(centerLocal))
  cloud.updateMatrixWorld(true)
  cloud.userData.attachmentRole = "companion-cloud"
  cloud.userData.companionPrepared = true
  return cloud
}

export class AssetRegistry {
  constructor({manifest = HERO_ASSETS, load = null} = {}) {
    this.manifest = manifest
    this.load = load || loadWith(new GLTFLoader())
    this.heroLoads = new Map()
    this.companionLoads = new Map()
    this.readyHeroes = new Set()
    this.readyCompanions = new Set()
    this.heroAssets = new Map()
    this.companionAssets = new Map()
    this.heroTemplates = new Map()
    this.companionTemplates = new Map()
  }

  hasHero(name) {
    return Boolean(this.manifest[name]?.available)
  }

  loadHero(name) {
    const resolvedName = this.manifest[name] ? name : resolveHeroName(name)
    const asset = this.manifest[resolvedName] || getHeroAsset(resolvedName)
    if (!asset?.available) return Promise.resolve(null)
    if (asset.procedural) {
      this.readyHeroes.add(asset.id)
      return Promise.resolve(null)
    }
    if (!this.heroLoads.has(asset.id)) {
      const pending = this.load(runtimeAssetUrl(asset, asset.url))
        .then(gltf => {
          this.readyHeroes.add(asset.id)
          this.heroAssets.set(asset.id, gltf)
          return gltf
        })
        .catch(error => {
          this.heroLoads.delete(asset.id)
          this.readyHeroes.delete(asset.id)
          this.heroAssets.delete(asset.id)
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
      const pending = this.load(runtimeAssetUrl(asset, asset.companionUrl))
        .then(gltf => {
          this.readyCompanions.add(asset.id)
          this.companionAssets.set(asset.id, gltf)
          return gltf
        })
        .catch(error => {
          this.companionLoads.delete(asset.id)
          this.readyCompanions.delete(asset.id)
          this.companionAssets.delete(asset.id)
          throw error
        })
      this.companionLoads.set(asset.id, pending)
    }
    return this.companionLoads.get(asset.id)
  }

  isHeroReady(name) {
    const resolvedName = this.manifest[name] ? name : resolveHeroName(name)
    const asset = this.manifest[resolvedName] || getHeroAsset(resolvedName)
    return Boolean(asset?.available && (asset.procedural || this.readyHeroes.has(asset.id)) &&
      (!asset.companionUrl || this.readyCompanions.has(asset.id)))
  }

  areBattleAssetsReady() {
    const heroesReady = Object.keys(this.manifest)
      .filter(name => this.hasHero(name))
      .every(name => this.isHeroReady(name))
    return heroesReady
  }

  async preloadHeroes(names, concurrency = 2) {
    const queue = []
    for (const name of [...new Set(names)].filter(heroName => this.hasHero(heroName))) {
      queue.push({label: `${name} model`, load: () => this.loadHero(name)})
      const asset = this.manifest[name]
      if (asset.companionUrl) queue.push({label: `${name} companion`, load: () => this.loadHeroCompanion(name)})
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

  preloadBattleAssets(concurrency = 3) {
    return this.preloadHeroes(Object.keys(this.manifest), concurrency)
  }

  createHeroInstance(resolvedName, gltf, companionGltf) {
    const asset = this.manifest[resolvedName] || getHeroAsset(resolvedName)
    if (asset?.procedural && typeof asset.factory === "function") {
      const root = asset.factory()
      root.scale.multiplyScalar(asset.scale || 1)
      root.rotation.y = asset.rotationOffset || 0
      return {root, animations: [], companionAnimations: [], asset}
    }
    if (!gltf || !asset) return null
    const animations = gltf.animations || []
    let heroTemplate = this.heroTemplates.get(asset.id)
    if (!heroTemplate) {
      heroTemplate = clone(gltf.scene)
      cloneMaterials(heroTemplate)
      normalizeHeroHeight(heroTemplate, asset.targetHeight || 2.45)
      // Brock Zeus has rigidly authored elbow/hand pieces whose bind matrices
      // must remain independent. Merging these SkinnedMeshes into one shared
      // skeleton wrapper changes their visual seam in the lobby preview even
      // though the source GLB skinning is correct.
      if (resolvedName !== "Brock Zeus") mergeHeroRenderParts(heroTemplate)
      markSharedGeometry(heroTemplate)
      this.heroTemplates.set(asset.id, heroTemplate)
    }
    const root = clone(heroTemplate)
    cloneMaterials(root)
    root.traverse(child => {
      if (child.isMesh) {
        // Heroes already have a compact, texture-backed contact shadow in
        // HeroView. A second directional shadow follows the local player and
        // reads as a large moving dark patch on the ground.
        child.castShadow = false
        child.receiveShadow = true
      }
    })
    let cloudRoot = null
    if (companionGltf?.scene) {
      let cloudTemplate = this.companionTemplates.get(asset.id)
      if (!cloudTemplate) {
        cloudTemplate = clone(companionGltf.scene)
        markSharedGeometry(cloudTemplate)
        this.companionTemplates.set(asset.id, cloudTemplate)
      }
      cloudRoot = clone(cloudTemplate)
      cloneMaterials(cloudRoot)
      prepareCompanionCloudMaterial(cloudRoot)
      cloudRoot.traverse(child => {
        if (child.isMesh) {
          child.castShadow = false
          child.receiveShadow = true
        }
      })
    }
    normalizeHeroHeight(root, asset.targetHeight || 2.45)
    // Brock Zeus has rigidly authored elbow/hand pieces whose bind matrices
    // must remain independent. Merging these SkinnedMeshes into one shared
    // skeleton wrapper changes their visual seam in the lobby preview even
    // though the source GLB skinning is correct.
    if (resolvedName !== "Brock Zeus") mergeHeroRenderParts(root)
    root.scale.multiplyScalar(asset.scale)
    root.position.y += asset.groundOffset || 0
    root.rotation.y = asset.rotationOffset
    if (cloudRoot) attachCompanionCloud(root, cloudRoot)
    return {root, animations, companionAnimations: companionGltf?.animations || [], asset}
  }

  instantiateReadyHero(name) {
    const resolvedName = this.manifest[name] ? name : resolveHeroName(name)
    const asset = this.manifest[resolvedName] || getHeroAsset(resolvedName)
    if (!asset?.available || !this.isHeroReady(resolvedName)) return null
    return this.createHeroInstance(
      resolvedName,
      this.heroAssets.get(asset.id),
      asset.companionUrl ? this.companionAssets.get(asset.id) : null,
    )
  }

  async instantiateHero(name) {
    const resolvedName = this.manifest[name] ? name : resolveHeroName(name)
    const [gltf, companionGltf] = await Promise.all([
      this.loadHero(resolvedName),
      this.loadHeroCompanion(resolvedName),
    ])
    return this.createHeroInstance(resolvedName, gltf, companionGltf)
  }

  clear() {
    this.heroLoads.clear()
    this.companionLoads.clear()
    this.readyHeroes.clear()
    this.readyCompanions.clear()
    this.heroAssets.clear()
    this.companionAssets.clear()
  }
}

export const assetRegistry = new AssetRegistry()
