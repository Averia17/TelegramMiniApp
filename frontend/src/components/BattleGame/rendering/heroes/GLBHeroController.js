import * as THREE from "three"
import {createNeedleSporeVisual, createProjectileVisual} from "../combat/ProjectileRenderer.js"
import {getAttackSwingYaw} from "./attackSwing.js"

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const CLOUD_STORM_TINT = new THREE.Color(0x07111e)
export const LOCOMOTION_FADE = 0.16
export const OVERLAY_FADE = 0.18
const MANDY_SPAWN_STAFF_REVEAL_SECONDS = 20 / 30
const FULL_BODY_OVERLAYS = new Set(["attack", "super", "gadget", "aimGadget", "hit", "spawn"])
const UPPER_BONE = /(spine|chest|neck|head|shoulder|clavicle|arm|hand|finger|weapon)/i
const LOWER_BONE = /(root|hips?|pelvis|leg|thigh|calf|foot|toe)/i

const trackNodeName = trackName => {
  const propertyAt = trackName.lastIndexOf(".")
  const path = propertyAt >= 0 ? trackName.slice(0, propertyAt) : trackName
  return path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf(":")) + 1)
}

const findSideArm = (nodes, side) => {
  const sideName = side === "left" ? "left" : "right"
  const sideLetter = side === "left" ? "l" : "r"
  const candidates = [...nodes.values()].filter(node => node.isBone)
  return candidates.find(node =>
    new RegExp(`${sideName}.*(upper.?arm|shoulder)`, "i").test(node.name))
    || candidates.find(node =>
      new RegExp(`(^|[_:])${sideLetter}(?:eft|ight)?[_:]?(upper.?arm|arm|shoulder)([_:]|$)`, "i").test(node.name)
      && !/(forearm|lowerarm|hand|wrist)/i.test(node.name))
    || candidates.find(node =>
      new RegExp(`${sideName}.*arm`, "i").test(node.name)
      && !/(forearm|lowerarm|hand|wrist)/i.test(node.name))
    || null
}

const matchesSide = (name, side) => {
  const word = side === "left" ? "left" : "right"
  const letter = side === "left" ? "l" : "r"
  return new RegExp(`(^|[_:.])${letter}(?:eft|ight)?(?=[_:.A-Z]|$)|${word}`, "i").test(name)
}

const findLegChain = (nodes, side) => {
  const bones = [...nodes.values()].filter(node => node.isBone && matchesSide(node.name, side))
  const upper = bones.find(node => /(upper.?leg|thigh)/i.test(node.name) && !/(bend|twist)/i.test(node.name))
    || bones.find(node => /leg/i.test(node.name) && !/(lower|calf|foot|toe|cloth|bend|twist)/i.test(node.name))
    || null
  const descendants = []
  upper?.traverse(node => {
    if (node !== upper && node.isBone) descendants.push(node)
  })
  const lower = descendants.find(node => /(lower.?leg|calf|shin)/i.test(node.name) && !/(bend|twist)/i.test(node.name))
    || bones.find(node => /(lower.?leg|calf|shin)/i.test(node.name) && !/(bend|twist)/i.test(node.name))
    || null
  const footNodes = []
  ;(lower || upper)?.traverse(node => {
    if (node !== lower && node !== upper && node.isBone) footNodes.push(node)
  })
  const foot = footNodes.find(node => /(foot|toe)/i.test(node.name) && !/(end|roll)/i.test(node.name))
    || bones.find(node => /(foot|toe)/i.test(node.name) && !/(end|roll)/i.test(node.name))
    || null
  return {upper, lower, foot}
}

const findRig = root => {
  const nodes = new Map()
  root.traverse(node => {
    if (node.name) nodes.set(node.name, node)
  })
  const upperRoot = [...nodes.values()].find(node => node.isBone && /^(spine|chest)$/i.test(node.name))
    || [...nodes.values()].find(node => node.isBone && /(spine|chest)/i.test(node.name))
    || null
  const upperNames = new Set()
  upperRoot?.traverse(node => {
    if (node.name) upperNames.add(node.name)
  })
  return {
    upperRoot,
    upperNames,
    leftArm: findSideArm(nodes, "left"),
    rightArm: findSideArm(nodes, "right"),
    legs: {
      left: findLegChain(nodes, "left"),
      right: findLegChain(nodes, "right"),
    },
    head: [...nodes.values()].find(node => /(^|[_:])head(?:[_:]|$)/i.test(node.name) || /^head/i.test(node.name)) || null,
    rightHand: nodes.get("Socket.Weapon.R")
      || [...nodes.values()].find(node => node.isBone && /(^|[_:])right_?hand$/i.test(node.name))
      || [...nodes.values()].find(node => node.isBone && /right.*hand/i.test(node.name))
      || [...nodes.values()].find(node => node.isBone && /(^|[_:])r(?:ight)?_?wrist(?:[_:]|$)/i.test(node.name))
      || null,
  }
}

const upperBodyClip = (clip, upperNames) => {
  const tracks = clip.tracks.filter(track => {
    const nodeName = trackNodeName(track.name)
    if (upperNames.size) return upperNames.has(nodeName)
    return UPPER_BONE.test(nodeName) && !LOWER_BONE.test(nodeName)
  })
  return tracks.length ? new THREE.AnimationClip(`${clip.name}:upper`, clip.duration, tracks) : clip
}

const sanitizeAuthoredClip = (clip, root) => {
  const tracks = clip.tracks.filter(track => {
    const nodeName = trackNodeName(track.name)
    const node = root.getObjectByName(nodeName)
    const unsafeRoot = node && /(root|hips?|pelvis)/i.test(nodeName) && node.position.length() > 10
    if (unsafeRoot) return false
    if (!track.name.endsWith(".position")) return true
    const maxPositionValue = Math.max(...track.values.map(value => Math.abs(value)))
    return maxPositionValue <= 20
  })
  return tracks.length === clip.tracks.length
    ? clip
    : new THREE.AnimationClip(`${clip.name}:sanitized`, clip.duration, tracks)
}

const fullBodySuperClip = clip => {
  const tracks = clip.tracks.filter(track => !/(root|hips?|pelvis)/i.test(trackNodeName(track.name)))
  return tracks.length === clip.tracks.length
    ? clip
    : new THREE.AnimationClip(`${clip.name}:full-body`, clip.duration, tracks)
}

const configureOneShot = (action, holdFinalPose = false) => {
  action.setLoop(THREE.LoopOnce, 1)
  action.clampWhenFinished = holdFinalPose
}

const createCloudLightning = () => {
  const group = new THREE.Group()
  group.name = "CloudLightningStrike"
  group.visible = false
  const coreMaterial = new THREE.MeshBasicMaterial({
    color: 0xf5fdff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  })
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0x119bdd,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  })
  const points = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(.12, -.26, .02),
    new THREE.Vector3(-.10, -.52, -.01),
    new THREE.Vector3(.14, -.79, .03),
    new THREE.Vector3(-.04, -1.08, 0),
  ]
  const addBoltSegment = (start, end, radius, material, layer) => {
    const delta = end.clone().sub(start)
    const segment = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius * .72, delta.length(), 7),
      material.clone(),
    )
    segment.position.copy(start).add(end).multiplyScalar(.5)
    segment.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize())
    segment.userData.lightningLayer = layer
    group.add(segment)
  }
  for (let index = 0; index < points.length - 1; index += 1) {
    addBoltSegment(points[index], points[index + 1], .075, glowMaterial, "glow")
    addBoltSegment(points[index], points[index + 1], .026, coreMaterial, "core")
  }
  addBoltSegment(points[2], new THREE.Vector3(-.34, -.72, .02), .035, glowMaterial, "glow")
  addBoltSegment(points[2], new THREE.Vector3(-.34, -.72, .02), .012, coreMaterial, "core")
  const impact = new THREE.Mesh(new THREE.SphereGeometry(.16, 12, 8), glowMaterial.clone())
  impact.position.copy(points.at(-1))
  impact.userData.lightningLayer = "impact"
  group.add(impact)
  return group
}

export class GLBHeroController {
  constructor(root, clips = [], clipNames = {}, options = {}) {
    this.root = root
    this.mixer = new THREE.AnimationMixer(root)
    this.cloudMixer = null
    this.cloudActions = new Map()
    this.cloudState = null
    this.actions = new Map()
    this.state = null
    this.overlay = null
    this.overlayBlendOutScheduled = false
    this.spawnBlendOutScheduled = false
    this.locomotionSuppressed = false
    this.lastAttackPulse = options.attackPulse
    this.lastSuperPulse = options.superPulse
    this.lastGadgetPulse = options.gadgetPulse
    this.lastSpawnPulse = options.spawnPulse
    this.heroName = options.heroName || ""
    this.previewLayout = Boolean(options.previewLayout)
    this.elapsed = 0
    this.deathElapsed = 0
    this.attackVisualRemaining = 0
    this.attackSwingYaw = 0
    this.rig = findRig(root)
    if (!this.rig.rightHand) {
      this.rig.rightHand = root.getObjectByName("R_wrist_s")
        || root.getObjectByName("R_wrist")
        || null
    }
    this.heldProjectile = null
    const carriesSpore = !this.heroName || this.heroName === "Needle"
    // Fairy Mina has no authored weapon or carried orb. Her stars are
    // detached frontend projectiles created by the attack renderer; keeping a
    // permanent hand orb makes every idle/aim/super pose read as a held item.
    const carriesFairyOrb = false
    if (this.rig.rightHand && (carriesSpore || carriesFairyOrb)) {
      this.heldProjectile = carriesFairyOrb
        ? createProjectileVisual({kind: "mina_star_fan", held: true})
        : createNeedleSporeVisual({color: 0x75d947}, {held: true})
      this.heldProjectile.name = carriesFairyOrb ? "HeldFairyOrb" : "HeldNeedleSpore"
      this.rig.rightHand.updateWorldMatrix(true, false)
      const handWorldScale = this.rig.rightHand.getWorldScale(new THREE.Vector3())
      const authoredScale = Math.max(.0001, handWorldScale.x, handWorldScale.y, handWorldScale.z)
      const inverseAuthoredScale = 1 / authoredScale
      // Imported rigs use very different authoring units. Define the orb and
      // its hand offset in scene units so Fairy Mina cannot receive an
      // invisible speck (or a giant sphere) after height normalization.
      this.heldProjectileBaseScale = (carriesFairyOrb ? .78 : .82) * inverseAuthoredScale
      this.heldProjectileWorldOffset = carriesFairyOrb ? new THREE.Vector3(0, .08, .32) : null
      this.heldProjectileWorldPosition = carriesFairyOrb ? new THREE.Vector3() : null
      this.heldProjectile.position.set(
        .06 * inverseAuthoredScale,
        .08 * inverseAuthoredScale,
        (carriesFairyOrb ? .32 : -.09) * inverseAuthoredScale,
      )
      this.heldProjectile.scale.setScalar(this.heldProjectileBaseScale)
      this.heldProjectile.rotation.set(0.18, 0.35, -0.12)
      this.heldProjectile.visible = true
      this.rig.rightHand.add(this.heldProjectile)
    }
    this.detachedAmmo = []
    this.cloud = null
    this.cloudMaterialBases = []
    this.cloudCaster = null
    this.throwableWeapon = null
    this.meleeWeapon = null
    root.traverse(node => {
      const attachmentRole = node.userData.attachment_role || node.userData.attachmentRole
      if (["held-weapon", "melee-weapon", "melee-weapon-left", "melee-weapon-right", "held-weapons"].includes(attachmentRole)
        && !this.meleeWeapon) {
        this.meleeWeapon = node
        this.meleeWeapon.userData.attachmentRole = "held-weapon"
      }
      if (attachmentRole === "detached-ammo" || /waterball.*hide_ingame/i.test(node.name)) {
        node.visible = false
        node.userData.attachmentRole = "detached-ammo"
        this.detachedAmmo.push(node)
      }
      if (/lobby_speaker.*hide_ingame/i.test(node.name)) {
        node.visible = false
        node.userData.attachmentRole = "menu-only"
      }
      const carriesCompanionCloud = this.heroName === "Brock Zeus"
      if (carriesCompanionCloud
        && (["attack-cloud", "companion-cloud"].includes(attachmentRole)
          || /^HeroAttachment_Cloud$/i.test(node.name))
        && !this.cloud) {
        this.cloud = node
        this.cloud.userData.attachmentRole = this.heroName === "Brock Zeus"
          ? "attack-cloud"
          : "companion-cloud"
      }
      if (this.heroName === "Brock Zeus" && node.isMesh && !/cloud/i.test(node.name) && !this.cloudCaster) {
        this.cloudCaster = node
      }
      if ((attachmentRole === "throwable-weapon" || /HeroAttachment_Speaker$/i.test(node.name)) && !this.throwableWeapon) {
        this.throwableWeapon = node
        this.throwableWeapon.userData.attachmentRole = "throwable-weapon"
      }
    })
    if (this.cloud) {
      this.cloud.traverse(node => {
        if (!node.isMesh) return
        const materials = Array.isArray(node.material) ? node.material : [node.material]
        materials.filter(Boolean).forEach(material => {
          this.cloudMaterialBases.push({
            material,
            color: material.color?.clone() || null,
            emissive: material.emissive?.clone() || null,
            emissiveIntensity: material.emissiveIntensity,
          })
        })
      })
      if (this.previewLayout) {
        this.cloud.traverse(node => {
          if (!node.isMesh) return
          node.renderOrder = -1
          const materials = Array.isArray(node.material) ? node.material : [node.material]
          materials.filter(Boolean).forEach(material => {
            material.depthTest = false
            material.depthWrite = false
          })
        })
      }
      root.updateMatrixWorld(true)
      const cloudBounds = new THREE.Box3().setFromObject(this.cloud)
      const cloudSize = cloudBounds.getSize(new THREE.Vector3())
      const cloudExtent = Math.max(cloudSize.x, cloudSize.y, cloudSize.z)
      if (Number.isFinite(cloudExtent) && cloudExtent > .001) {
        this.cloud.scale.multiplyScalar(.64 / cloudExtent)
        this.root.updateMatrixWorld(true)
        const centerWorld = new THREE.Box3().setFromObject(this.cloud).getCenter(new THREE.Vector3())
        // Target is expressed in gameplay scene units. The imported root may
        // carry a large authoring-unit scale, so do not transform this offset
        // as if it were another source-space coordinate.
        // The diagonal lobby camera projects Brock's normal gameplay cloud far
        // to the right. In previews, compensate for that view and tuck it behind
        // his silhouette so the fighter remains the visual center.
        const cloudTarget = this.previewLayout
          ? new THREE.Vector3(-2.1, 1.34, -.28)
          : new THREE.Vector3(.90, 1.82, -.10)
        const targetWorld = root.getWorldPosition(new THREE.Vector3()).add(cloudTarget)
        const centerInParent = this.cloud.parent.worldToLocal(centerWorld.clone())
        const targetInParent = this.cloud.parent.worldToLocal(targetWorld.clone())
        this.cloud.position.add(targetInParent.sub(centerInParent))
      }
    }
    this.cloudBasePosition = this.cloud?.position.clone() || null
    this.cloudBaseScale = this.cloud?.scale.clone() || null
    this.cloudCasterBasePosition = this.cloudCaster?.position.clone() || null
    this.cloudCasterBaseQuaternion = this.cloudCaster?.quaternion.clone() || null
    this.cloudCasterMotionScale = 1
    if (this.cloudCaster?.parent) {
      const parentScale = this.cloudCaster.parent.getWorldScale(new THREE.Vector3())
      this.cloudCasterMotionScale = 1 / Math.max(.001, parentScale.x, parentScale.y, parentScale.z)
    }
    this.cloudLightning = null
    if (this.cloud && this.heroName === "Brock Zeus") {
      this.cloudLightning = createCloudLightning()
      root.add(this.cloudLightning)
    }
    if (this.cloud && options.companionAnimations?.length) {
      this.cloudMixer = new THREE.AnimationMixer(this.cloud)
      for (const [semanticName, clipName] of Object.entries(clipNames)) {
        const source = THREE.AnimationClip.findByName(options.companionAnimations, `Cloud_${clipName}`)
          || THREE.AnimationClip.findByName(options.companionAnimations, clipName)
        if (!source) continue
        const action = this.cloudMixer.clipAction(source)
        if (["attack", "super", "gadget", "spawn", "hit", "defeat"].includes(semanticName)) {
          configureOneShot(action, semanticName === "spawn")
        } else {
          action.setLoop(THREE.LoopRepeat, Infinity)
        }
        action.enabled = true
        action.setEffectiveWeight(0)
        this.cloudActions.set(semanticName, action)
      }
      this.transitionCloud("idle", 0)
    }
    this.spawnScale = root.scale.clone()
    this.basePosition = root.position.clone()
    this.spawnCactus = root.getObjectByName("SpawnCactus")
    this.spawnCactusScale = this.spawnCactus?.scale.clone() || null
    this.heroMeshes = []
    root.traverse(node => {
      if (!node.isMesh) return
      let parent = node.parent
      while (parent && parent !== root && parent !== this.spawnCactus) parent = parent.parent
      if (parent !== this.spawnCactus) this.heroMeshes.push(node)
    })
    this.heroMaterials = [...new Set(this.heroMeshes.flatMap(mesh =>
      (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).filter(Boolean),
    ))]
    this.hitColor = new THREE.Color(0xff2020)
    this.heroMaterials.forEach(material => {
      if (!material.emissive) return
      material.userData.glbHeroBaseEmissive ||= material.emissive.clone()
      if (material.userData.glbHeroBaseEmissiveIntensity === undefined) {
        material.userData.glbHeroBaseEmissiveIntensity = material.emissiveIntensity
      }
    })
    if (this.spawnCactus) this.spawnCactus.visible = false
    this.spawnElapsed = 0
    this.mandySpawnStaffElapsed = MANDY_SPAWN_STAFF_REVEAL_SECONDS
    this.spawnDuration = Math.max(0.9, Number(options.spawnDuration) || 1.45)
    this.aimWeight = 0
    this.aimYaw = 0
    this.aimPitch = 0
    this.appliedUpperAim = new THREE.Quaternion()
    this.appliedHeadAim = new THREE.Quaternion()
    this.appliedLegGait = new Map()
    // Rich GLBs already contain authored attack motion. Applying another
    // bind-pose-relative Euler rotation here twists shoulders and makes held
    // weapons drift. Brock's non-skeletal cast remains handled by cloudCaster.
    this.attackPoseNodes = []
    this.lastHitAmount = 0
    this.fallbackEvents = []

    for (const [semanticName, clipName] of Object.entries(clipNames)) {
      const source = THREE.AnimationClip.findByName(clips, clipName)
      if (!source) continue
      const sanitizedSource = sanitizeAuthoredClip(source, this.root)
      const clip = semanticName === "super" && options.fullBodySuper
        ? fullBodySuperClip(sanitizedSource)
        : ["aim", "super"].includes(semanticName)
          ? upperBodyClip(sanitizedSource, this.rig.upperNames)
          : sanitizedSource
      const action = this.mixer.clipAction(clip)
      if (["attack", "super", "gadget", "spawn", "hit", "defeat"].includes(semanticName)) {
        configureOneShot(action, semanticName === "spawn")
      }
      this.actions.set(semanticName, action)
    }
    for (const action of this.actions.values()) {
      action.enabled = true
      action.setEffectiveWeight(0)
    }
    for (const semanticName of ["aim", "aimSuper"]) {
      const aim = this.actions.get(semanticName)
      if (!aim) continue
      aim.enabled = true
      aim.setEffectiveWeight(0)
      aim.play()
    }
    const runClip = this.actions.get("run")?.getClip()
    this.proceduralRunFallback = Boolean(runClip && !runClip.tracks.some(track => /(leg|thigh|calf|shin|foot|toe)/i.test(track.name)))
    this.proceduralAimFallback = !this.actions.get("aim")?.getClip().tracks.length

    this.mixer.addEventListener("finished", event => {
      const finished = [...this.actions.entries()].find(([, action]) => action === event.action)?.[0]
      if (finished === this.overlay) {
        const wasFullBody = FULL_BODY_OVERLAYS.has(finished)
        this.overlay = null
        if (wasFullBody) {
          event.action.stop().setEffectiveWeight(0)
          this.restoreLocomotion()
        }
      }
      if (finished === "spawn") {
        this.spawnBlendOutScheduled = false
        event.action.stop().setEffectiveWeight(0)
        this.state = null
        this.restoreLocomotion()
      }
    })
    if ((this.actions.has("spawn") || this.spawnCactus) && options.spawnOnLoad !== false) this.playSpawn()
  }

  transitionLocomotion(name, fadeSeconds = LOCOMOTION_FADE) {
    const next = this.actions.get(name)
    if (!next || this.state === name) return Boolean(next)
    if (this.locomotionSuppressed) {
      this.state = name
      return true
    }
    const previous = this.actions.get(this.state)
    next.enabled = true
    next.reset().setEffectiveWeight(1).play()
    if (previous && previous !== next && !["spawn"].includes(this.state)) {
      previous.crossFadeTo(next, fadeSeconds, false)
    } else {
      if (previous && previous !== next) previous.fadeOut(fadeSeconds)
      next.setEffectiveWeight(1)
    }
    this.state = name
    this.transitionCloud(name, fadeSeconds)
    return true
  }

  transitionCloud(name, fadeSeconds = LOCOMOTION_FADE) {
    const next = this.cloudActions.get(name)
    if (!next || this.cloudState === name) return Boolean(next)
    this.cloud.visible = true
    const previous = this.cloudActions.get(this.cloudState)
    next.enabled = true
    next.reset().setEffectiveWeight(1).play()
    if (previous && previous !== next) previous.crossFadeTo(next, fadeSeconds, false)
    else next.setEffectiveWeight(1)
    this.cloudState = name
    return true
  }

  updateAuthoredCloudEffects() {
    if (!this.cloud || !this.cloudActions.size) return
    const action = this.cloudActions.get(this.cloudState)
    const duration = Math.max(.001, action?.getClip().duration || 1)
    if (this.cloudState === "defeat" && action && !action.isRunning() && action.time >= duration - 1e-4) {
      this.cloud.visible = false
      if (this.cloudLightning) this.cloudLightning.visible = false
      return
    }
    this.cloud.visible = true
    const phase = ((action?.time || 0) % duration) / duration
    const pulse = (center, width) => clamp(1 - Math.abs(phase - center) / width, 0, 1)
    let strike = 0
    let stormDarkness = 0
    if (this.cloudState === "idle") {
      strike = Math.pow(Math.max(0, Math.sin(this.elapsed * 4.2)), 14) * .7
    } else if (this.cloudState === "attack") {
      strike = pulse(6 / 16, .09)
    } else if (this.cloudState === "super") {
      strike = Math.max(pulse(.50, .055), pulse(.60, .055), pulse(.70, .055))
      stormDarkness = Math.sin(Math.PI * clamp(phase, 0, 1)) * .68
    } else if (this.cloudState === "hit") {
      strike = pulse(3 / 12, .10)
    } else if (this.cloudState === "victory") {
      strike = Math.max(pulse(20 / 60, .07), pulse(28 / 60, .07))
    } else if (this.cloudState === "gadget") {
      strike = pulse(4 / 16, .10) * .55
    } else if (["aim", "aimSuper", "aimGadget"].includes(this.cloudState)) {
      strike = Math.pow(Math.max(0, Math.sin(this.elapsed * 5.5)), 18) * .35
    }
    this.cloud.userData.lightningCharge = Math.max(strike, stormDarkness * .25)
    for (const base of this.cloudMaterialBases) {
      if (base.color && base.material.color) {
        base.material.color.copy(base.color).lerp(CLOUD_STORM_TINT, stormDarkness * .55)
      }
      if (base.emissive && base.material.emissive) {
        base.material.emissive.copy(base.emissive).lerp(CLOUD_STORM_TINT, stormDarkness * .45)
        if (base.emissiveIntensity !== undefined) {
          base.material.emissiveIntensity = base.emissiveIntensity * (1 + stormDarkness * .2)
        }
      }
    }
    if (!this.cloudLightning) return
    this.root.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(this.cloud)
    const cloudWorld = bounds.isEmpty()
      ? this.cloud.getWorldPosition(new THREE.Vector3())
      : bounds.getCenter(new THREE.Vector3())
    this.cloudLightning.position.copy(this.root.worldToLocal(cloudWorld))
    const rootWorldScale = this.root.getWorldScale(new THREE.Vector3())
    this.cloudLightning.scale.set(
      1 / Math.max(.001, rootWorldScale.x),
      1 / Math.max(.001, rootWorldScale.y),
      1 / Math.max(.001, rootWorldScale.z),
    )
    this.cloudLightning.visible = strike > .02
    this.cloudLightning.rotation.z = Math.sin(this.elapsed * 93) * .035
    this.cloudLightning.children.forEach(child => {
      if (!child.material) return
      const layer = child.userData.lightningLayer
      child.material.opacity = layer === "core"
        ? strike
        : strike * (layer === "impact" ? .52 : .82)
    })
  }

  playSafe(name, fallback = "idle", fadeSeconds = OVERLAY_FADE) {
    if (this.actions.has(name)) return this.playOverlay(name, fadeSeconds)
    const event = {hero: this.heroName, requested: name, fallback}
    this.fallbackEvents.push(event)
    if (this.fallbackEvents.length > 32) this.fallbackEvents.shift()
    console.warn(`[GLBHeroController] Missing animation "${name}" for ${this.heroName || "hero"}; falling back to "${fallback}".`)
    if (fallback === "idle" || fallback === "run") this.transitionLocomotion(fallback, fadeSeconds)
    return false
  }

  playOverlay(name, fadeSeconds = OVERLAY_FADE) {
    const next = this.actions.get(name)
    if (!next) return false
    if (FULL_BODY_OVERLAYS.has(name)) this.suppressLocomotion(fadeSeconds)
    const previous = this.actions.get(this.overlay)
    if (previous && previous !== next) previous.fadeOut(fadeSeconds)
    next.enabled = true
    next.reset().setEffectiveWeight(1).fadeIn(fadeSeconds).play()
    this.overlay = name
    this.overlayBlendOutScheduled = false
    this.transitionCloud(name, fadeSeconds)
    if (name === "attack" && this.heldProjectile) this.heldProjectile.visible = true
    return true
  }

  clearOverlay() {
    const previousName = this.overlay
    const previous = this.actions.get(this.overlay)
    if (previous) previous.stop().setEffectiveWeight(0)
    this.overlay = null
    this.overlayBlendOutScheduled = false
    if (previousName && this.cloudActions.size) {
      this.transitionCloud(this.state === "run" ? "run" : "idle", OVERLAY_FADE)
    }
    if (FULL_BODY_OVERLAYS.has(previousName)) this.restoreLocomotion()
  }

  suppressLocomotion(fadeSeconds = OVERLAY_FADE) {
    if (this.locomotionSuppressed) return
    this.locomotionSuppressed = true
    for (const name of ["idle", "run"]) {
      const action = this.actions.get(name)
      if (action) action.fadeOut(fadeSeconds)
    }
  }

  restoreLocomotion(fadeSeconds = LOCOMOTION_FADE) {
    if (!this.locomotionSuppressed) return
    this.locomotionSuppressed = false
    const name = this.state === "run" ? "run" : "idle"
    const action = this.actions.get(name)
    if (!action) return
    action.enabled = true
    // Locomotion keeps advancing while its weight is faded out during a
    // full-body overlay. Resetting it here snaps the character back to the
    // first idle/run frame exactly when a skill ends, which reads as a broken
    // frame switch instead of a continuous transition.
    if (!action.isRunning()) action.play()
    action.fadeIn(Math.max(.001, fadeSeconds))
    this.transitionCloud(name, fadeSeconds)
  }

  playOutcome(name, fadeSeconds = LOCOMOTION_FADE) {
    if (!this.actions.has(name)) return this.playSafe(name, "idle", fadeSeconds)
    if (this.state === "spawn") {
      const spawn = this.actions.get("spawn")
      if (spawn) spawn.stop().setEffectiveWeight(0)
      this.state = null
    }
    this.clearOverlay()
    if (this.locomotionSuppressed) this.restoreLocomotion()
    const action = this.actions.get(name)
    action.setLoop(THREE.LoopRepeat, Infinity)
    action.clampWhenFinished = false
    const transitioned = this.transitionLocomotion(name, fadeSeconds)
    // Results are locomotion actions for the character, but the companion
    // still needs its matching one-shot/action track.  Keep this explicit so
    // a repeated result pulse can recover the cloud even when the character
    // is already in the same outcome state.
    this.transitionCloud(name, fadeSeconds)
    return transitioned
  }

  playSpawn() {
    this.clearOverlay()
    this.suppressLocomotion(0)
    this.spawnBlendOutScheduled = false
    this.root.visible = true
    this.spawnElapsed = 0
    this.mandySpawnStaffElapsed = 0
    if (this.heroName === "Mandy" && this.meleeWeapon) this.meleeWeapon.visible = false
    const action = this.actions.get("spawn")
    this.transitionCloud("spawn", 0)
    if (this.spawnCactus && !action) {
      this.spawnCactus.visible = true
      this.spawnCactus.scale.copy(this.spawnCactusScale)
      this.spawnCactus.position.set(0, 0, 0)
      this.heroMeshes.forEach(mesh => { mesh.visible = false })
    } else if (this.spawnCactus) {
      this.spawnCactus.visible = false
      this.heroMeshes.forEach(mesh => { mesh.visible = true })
    }
    if (action) {
      this.root.scale.copy(this.spawnScale)
      this.root.position.copy(this.basePosition)
      action.reset()
        .setEffectiveWeight(1)
        .setEffectiveTimeScale(action.getClip().duration / this.spawnDuration)
        .play()
      this.state = "spawn"
    } else {
      this.state = "spawn"
      this.root.scale.copy(this.spawnScale).multiplyScalar(0.01)
    }
  }

  update(deltaSeconds, input = {}) {
    if (this.state === "spawn" && this.heroName === "Mandy") {
      this.mandySpawnStaffElapsed = Math.min(
        MANDY_SPAWN_STAFF_REVEAL_SECONDS,
        this.mandySpawnStaffElapsed + Math.max(0, deltaSeconds),
      )
    }
    const mandyStaffRevealReady = this.heroName !== "Mandy"
      || this.state !== "spawn"
      || this.mandySpawnStaffElapsed >= MANDY_SPAWN_STAFF_REVEAL_SECONDS - 1e-6
    if (this.meleeWeapon && input.alive !== false && mandyStaffRevealReady) this.meleeWeapon.visible = true
    this.elapsed += deltaSeconds
    if (input.alive === false) {
      this.root.visible = true
      if (this.state !== "dead") {
        this.clearOverlay()
        this.transitionLocomotion("defeat", 0.06)
        this.state = "dead"
        this.deathElapsed = 0
      }
      this.deathElapsed += Math.max(0, deltaSeconds)
      this.mixer.update(deltaSeconds)
      this.cloudMixer?.update(deltaSeconds)
      this.updateAuthoredCloudEffects()
      return
    }
    if (this.lastSpawnPulse !== input.spawnPulse && input.spawnPulse !== undefined) {
      this.playSpawn()
    } else if (this.state === "dead" && input.alive !== false) {
      this.playSpawn()
    }
    this.lastSpawnPulse = input.spawnPulse

    if (this.lastGadgetPulse !== input.gadgetPulse && input.gadgetPulse !== undefined) {
      this.playSafe("gadget")
    } else if (this.lastSuperPulse !== input.superPulse && input.superPulse !== undefined) {
      this.playSafe("super")
    } else if (this.lastAttackPulse !== input.attackPulse && input.attackPulse !== undefined) {
      this.playSafe("attack")
      this.attackVisualRemaining = .42
    }
    this.lastAttackPulse = input.attackPulse
    this.lastSuperPulse = input.superPulse
    this.lastGadgetPulse = input.gadgetPulse
    if (this.cloud && this.cloudBasePosition && !this.cloudActions.size) {
      this.attackVisualRemaining = Math.max(0, this.attackVisualRemaining - deltaSeconds)
      const attacking = this.overlay === "attack" || this.attackVisualRemaining > 0
      const attack = this.actions.get("attack")
      const phase = attack
        ? clamp(attack.time / Math.max(.001, attack.getClip().duration), 0, 1)
        : 1 - this.attackVisualRemaining / .42
      const charge = attacking ? Math.sin(clamp(phase, .08, .92) * Math.PI) : 0
      const strike = attacking ? clamp(1 - Math.abs(phase - .52) / .16, 0, 1) : 0
      if (this.cloudCaster && this.cloudCasterBasePosition && this.cloudCasterBaseQuaternion) {
        const windup = clamp(phase / .36, 0, 1)
        const cast = clamp((phase - .36) / .18, 0, 1)
        const recover = clamp((phase - .58) / .42, 0, 1)
        const lean = attacking
          ? THREE.MathUtils.lerp(
            THREE.MathUtils.lerp(0, -.15, windup),
            THREE.MathUtils.lerp(.22, 0, recover),
            cast,
          )
          : 0
        this.cloudCaster.position.copy(this.cloudCasterBasePosition)
        this.cloudCaster.position.y += (-charge * .035 + strike * .09) * this.cloudCasterMotionScale
        this.cloudCaster.quaternion.copy(this.cloudCasterBaseQuaternion)
        this.cloudCaster.quaternion.multiply(
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, lean * .28, lean, "XYZ")),
        )
      }
      this.cloud.position.copy(this.cloudBasePosition)
      this.cloud.position.y += Math.sin(this.elapsed * 2.4) * 0.08 + charge * 0.16
      this.cloud.position.x += Math.cos(this.elapsed * 1.7) * 0.045
      this.cloud.scale.copy(this.cloudBaseScale).multiplyScalar(1 + charge * 0.12)
      this.cloud.userData.lightningCharge = charge
      if (this.cloudLightning) {
        this.root.updateMatrixWorld(true)
        const bounds = new THREE.Box3().setFromObject(this.cloud)
        const cloudWorld = bounds.isEmpty()
          ? this.cloud.getWorldPosition(new THREE.Vector3())
          : bounds.getCenter(new THREE.Vector3())
        this.cloudLightning.position.copy(this.root.worldToLocal(cloudWorld))
        const rootWorldScale = this.root.getWorldScale(new THREE.Vector3())
        this.cloudLightning.scale.set(
          1 / Math.max(.001, rootWorldScale.x),
          1 / Math.max(.001, rootWorldScale.y),
          1 / Math.max(.001, rootWorldScale.z),
        )
        this.cloudLightning.visible = strike > .02
        this.cloudLightning.rotation.z = Math.sin(this.elapsed * 93) * .035
        this.cloudLightning.children.forEach(child => {
          if (!child.material) return
          const layer = child.userData.lightningLayer
          child.material.opacity = layer === "core"
            ? strike
            : strike * (layer === "impact" ? .52 : .82)
        })
      }
    }

    if (this.state === "spawn" && !this.actions.has("spawn") && !this.spawnCactus) {
      const progress = Math.min(1, this.root.scale.x / Math.max(0.0001, this.spawnScale.x) + deltaSeconds * 7)
      this.root.scale.copy(this.spawnScale).multiplyScalar(progress)
      if (progress >= 1) this.state = null
    }
    if (this.state === "spawn" && !this.actions.has("spawn")) {
      this.spawnElapsed = Math.min(this.spawnDuration, this.spawnElapsed + deltaSeconds)
      const progress = this.spawnElapsed / this.spawnDuration
      const grow = 1 - Math.pow(1 - Math.min(1, progress / 0.62), 3)
      const settle = clamp((progress - 0.62) / 0.38, 0, 1)
      const overshoot = Math.sin(settle * Math.PI) * 0.16
      if (this.spawnCactus) {
        this.root.scale.copy(this.spawnScale)
        const transform = clamp((progress - 0.32) / 0.42, 0, 1)
        const cactusSquash = Math.sin(transform * Math.PI) * 0.18
        this.spawnCactus.scale.set(
          this.spawnCactusScale.x * (1 + cactusSquash),
          this.spawnCactusScale.y * Math.max(0.04, 1 - transform),
          this.spawnCactusScale.z * (1 + cactusSquash),
        )
        this.spawnCactus.position.y = -transform * 0.08
        this.spawnCactus.visible = transform < 0.98
        this.heroMeshes.forEach(mesh => { mesh.visible = progress >= 0.30 })
      } else {
        this.root.scale.set(
          this.spawnScale.x * Math.max(0.04, grow * (1 + overshoot)),
          this.spawnScale.y * Math.max(0.025, grow * (1.18 - overshoot * 1.5)),
          this.spawnScale.z * Math.max(0.04, grow * (1 + overshoot)),
        )
      }
      this.root.position.copy(this.basePosition)
      if (!this.spawnCactus) this.root.position.y -= (1 - grow) * 0.42
      if (!this.actions.has("spawn") && this.spawnElapsed >= this.spawnDuration) this.state = null
    } else if (this.state !== "spawn") {
      if (this.spawnCactus) {
        this.spawnCactus.visible = false
        this.heroMeshes.forEach(mesh => { mesh.visible = true })
      }
      this.root.scale.copy(this.spawnScale)
      this.root.position.copy(this.basePosition)
    }
    const outcomeState = this.state === "victory" || this.state === "defeat"
    if (input.result) {
      this.playOutcome(input.result, LOCOMOTION_FADE)
    } else if (this.state !== "spawn" && !outcomeState) {
      this.transitionLocomotion(input.moving ? "run" : "idle")
    }
    if (!this.overlay && this.state !== "spawn" && this.state !== "dead" && !outcomeState) {
      this.transitionCloud(
        input.superAiming ? "aimSuper" : input.aiming ? "aim" : input.moving ? "run" : "idle",
      )
    }

    const run = this.actions.get("run")
    if (run) {
      const referenceSpeed = Math.max(1, Number(input.referenceSpeed) || 240)
      run.timeScale = clamp((Number(input.speed) || 0) / referenceSpeed, 0.65, 1.65)
      if (input.moving) {
        const cycle = run.getClip().duration > 0 ? run.time / run.getClip().duration : 0
        const strideHeight = Math.abs(Math.sin(cycle * Math.PI * 2))
        this.root.position.y += strideHeight * 0.12
        const squash = 1 + (1 - strideHeight) * 0.04
        this.root.scale.set(
          this.spawnScale.x * squash,
          this.spawnScale.y * (2 - squash),
          this.spawnScale.z * squash,
        )
      }
    }

    const aim = this.actions.get("aim")
    if (aim) {
      const targetAimWeight = input.aiming && !input.superAiming ? (this.overlay ? 0.18 : 0.82) : 0
      this.aimWeight = THREE.MathUtils.damp(this.aimWeight, targetAimWeight, 20, deltaSeconds)
      aim.enabled = true
      aim.setEffectiveWeight(this.aimWeight)
      if (!aim.isRunning()) aim.play()
    }
    const aimSuper = this.actions.get("aimSuper")
    if (aimSuper) {
      const targetWeight = input.superAiming && !this.overlay ? 1 : 0
      aimSuper.enabled = true
      aimSuper.setEffectiveWeight(THREE.MathUtils.damp(aimSuper.getEffectiveWeight(), targetWeight, 18, deltaSeconds))
      if (!aimSuper.isRunning()) aimSuper.play()
    }

    this.aimYaw = THREE.MathUtils.damp(this.aimYaw, Number(input.aimYaw) || 0, 18, deltaSeconds)
    this.aimPitch = THREE.MathUtils.damp(this.aimPitch, Number(input.aimPitch) || 0, 18, deltaSeconds)
    if (this.rig.upperRoot) this.rig.upperRoot.quaternion.multiply(this.appliedUpperAim.clone().invert())
    if (this.rig.head) this.rig.head.quaternion.multiply(this.appliedHeadAim.clone().invert())
    for (const [bone, applied] of this.appliedLegGait) {
      bone.quaternion.multiply(applied.clone().invert())
    }
    this.appliedLegGait.clear()
    this.mixer.update(deltaSeconds)
    this.cloudMixer?.update(deltaSeconds)
    this.updateAuthoredCloudEffects()
    const attackAction = this.actions.get("attack")
    const attackPhase = attackAction
      ? clamp(attackAction.time / Math.max(.001, attackAction.getClip().duration), 0, 1)
      : 0
    this.attackSwingYaw = this.overlay === "attack"
      ? getAttackSwingYaw(attackPhase, input.attackHalfArcDegrees)
      : 0
    if (input.moving && this.proceduralRunFallback) {
      const speedRatio = clamp(
        (Number(input.speed) || 0) / Math.max(1, Number(input.referenceSpeed) || 240),
        .65,
        1.65,
      )
      const gait = this.elapsed * 9 * speedRatio
      for (const [side, leg] of Object.entries(this.rig.legs)) {
        const direction = side === "left" ? 1 : -1
        const swing = Math.sin(gait) * direction
        const gaitAngles = [
          [leg.upper, swing * .34],
          [leg.lower, Math.max(0, -swing) * .28 + Math.abs(Math.sin(gait)) * .08],
          [leg.foot, -swing * .16 - Math.max(0, swing) * .08],
        ]
        for (const [bone, angle] of gaitAngles) {
          if (!bone) continue
          const applied = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), angle)
          bone.quaternion.multiply(applied)
          this.appliedLegGait.set(bone, applied)
        }
      }
    }
    if (this.throwableWeapon) {
      const attack = this.actions.get("attack")
      const duration = attack?.getClip().duration || 1
      const phase = attack ? clamp(attack.time / duration, 0, 1) : 1
      const released = this.overlay === "attack" && attack?.isRunning() && phase >= .46 && phase < .9
      this.throwableWeapon.visible = !released
    }
    if (this.heldProjectile) {
      if (this.heldProjectileWorldOffset) {
        this.rig.rightHand.updateWorldMatrix(true, false)
        this.rig.rightHand.getWorldPosition(this.heldProjectileWorldPosition)
        this.heldProjectileWorldPosition.add(this.heldProjectileWorldOffset)
        this.heldProjectile.position.copy(
          this.rig.rightHand.worldToLocal(this.heldProjectileWorldPosition),
        )
      }
      const attack = this.actions.get("attack")
      const duration = attack?.getClip().duration || 1
      const phase = attack ? clamp(attack.time / duration, 0, 1) : 1
      const attacking = this.overlay === "attack" && attack?.isRunning()
      const released = attacking && phase >= 0.52 && phase < 0.92
      this.heldProjectile.visible = Boolean(!released && this.root.visible)
      if (attacking && !released) {
        const anticipation = Math.sin(Math.min(1, phase / 0.36) * Math.PI)
        const releaseStretch = clamp((phase - 0.38) / 0.14, 0, 1)
        const baseScale = this.heldProjectileBaseScale || 1
        this.heldProjectile.scale.set(
          baseScale * (1 - releaseStretch * 0.12),
          baseScale * (1 + releaseStretch * 0.32),
          baseScale * (1 - releaseStretch * 0.12),
        )
        this.heldProjectile.rotation.y = 0.35 + phase * 2.8
        this.heldProjectile.rotation.z = -0.12 - anticipation * 0.22
      } else if (!attacking) {
        const baseScale = this.heldProjectileBaseScale || 1
        this.heldProjectile.scale.setScalar(baseScale)
        this.heldProjectile.rotation.set(0.18, 0.35, -0.12)
      }
    }

    // Schedule the return to locomotion before a one-shot reaches its last
    // sample. The mixer dispatches `finished` after evaluating that sample;
    // waiting for the event leaves one rendered tick where the finished
    // overlay has already been stopped while idle/run is still faded to zero.
    // That empty blend is perceived as a hard frame switch by every hero.
    const overlayAction = this.overlay ? this.actions.get(this.overlay) : null
    if (
      overlayAction &&
      FULL_BODY_OVERLAYS.has(this.overlay) &&
      overlayAction.isRunning() &&
      !this.overlayBlendOutScheduled
    ) {
      const remaining = overlayAction.getClip().duration - overlayAction.time
      if (remaining <= OVERLAY_FADE) {
        this.overlayBlendOutScheduled = true
        overlayAction.fadeOut(Math.max(.001, remaining))
        this.restoreLocomotion(Math.max(.001, remaining))
      }
    }
    const spawnAction = this.state === "spawn" ? this.actions.get("spawn") : null
    if (
      spawnAction &&
      spawnAction.isRunning() &&
      !this.spawnBlendOutScheduled
    ) {
      const remaining = spawnAction.getClip().duration - spawnAction.time
      if (remaining <= LOCOMOTION_FADE) {
        this.spawnBlendOutScheduled = true
        spawnAction.fadeOut(Math.max(.001, remaining))
        this.restoreLocomotion(Math.max(.001, remaining))
      }
    }
    if (this.rig.upperRoot && this.proceduralAimFallback) {
      this.appliedUpperAim.setFromEuler(new THREE.Euler(
        clamp(this.aimPitch, -0.45, 0.45),
        clamp(this.aimYaw, -1.25, 1.25),
        0,
        "YXZ",
      ))
      this.rig.upperRoot.quaternion.multiply(this.appliedUpperAim)
    } else if (this.proceduralAimFallback) {
      this.appliedUpperAim.identity()
    }
    if (this.rig.head && this.proceduralAimFallback) {
      this.appliedHeadAim.setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        clamp(this.aimYaw * 0.18, -0.22, 0.22),
      )
      this.rig.head.quaternion.multiply(this.appliedHeadAim)
    } else if (this.proceduralAimFallback) {
      this.appliedHeadAim.identity()
    }
  }

  isDeathComplete() {
    if (this.state !== "dead") return false
    const authoredDuration = this.actions.get("defeat")?.getClip()?.duration
    return this.deathElapsed >= (Number(authoredDuration) || .62)
  }

  getDeathProgress() {
    if (this.state !== "dead") return 0
    const authoredDuration = this.actions.get("defeat")?.getClip()?.duration
    return clamp(this.deathElapsed / (Number(authoredDuration) || .62), 0, 1)
  }

  setHitFlash(amount) {
    const hit = clamp(amount, 0, 1)
    if (hit > .65 && this.lastHitAmount <= .65 && this.state !== "dead") this.playOverlay("hit", .025)
    this.lastHitAmount = hit
    for (const material of this.heroMaterials) {
      if (material.uniforms?.hit) material.uniforms.hit.value = hit
      if (material.emissive) {
        material.emissive.copy(material.userData.glbHeroBaseEmissive).lerp(this.hitColor, hit)
        material.emissiveIntensity = material.userData.glbHeroBaseEmissiveIntensity + hit * 1.8
      }
    }
  }

  dispose() {
    this.mixer.stopAllAction()
    this.mixer.uncacheRoot(this.root)
    this.cloudMixer?.stopAllAction()
    if (this.cloud) this.cloudMixer?.uncacheRoot(this.cloud)
    this.actions.clear()
    this.cloudActions.clear()
  }
}
