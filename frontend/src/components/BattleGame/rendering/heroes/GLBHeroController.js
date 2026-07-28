import * as THREE from "three"
import {createNeedleSporeVisual, createProjectileVisual} from "../combat/ProjectileRenderer.js"

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
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
    head: [...nodes.values()].find(node => /(^|[_:])head(?:[_:]|$)/i.test(node.name) || /^head/i.test(node.name)) || null,
    rightHand: [...nodes.values()].find(node => node.isBone && /(^|[_:])right_?hand$/i.test(node.name))
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
  const light = new THREE.PointLight(0x8de7ff, 0, 3.2, 2)
  light.position.y = -.72
  group.add(light)
  group.userData.light = light
  return group
}

export class GLBHeroController {
  constructor(root, clips = [], clipNames = {}, options = {}) {
    this.root = root
    this.mixer = new THREE.AnimationMixer(root)
    this.actions = new Map()
    this.state = null
    this.overlay = null
    this.lastAttackPulse = options.attackPulse
    this.lastSuperPulse = options.superPulse
    this.lastSpawnPulse = options.spawnPulse
    this.heroName = options.heroName || ""
    this.elapsed = 0
    this.attackVisualRemaining = 0
    this.rig = findRig(root)
    if (!this.rig.rightHand) {
      this.rig.rightHand = root.getObjectByName("R_wrist_s")
        || root.getObjectByName("R_wrist")
        || null
    }
    this.heldProjectile = null
    const carriesSpore = !this.heroName || this.heroName === "Shadow"
    const carriesFairyOrb = this.heroName === "Fairy Mina"
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
      this.heldProjectile.visible = false
      this.rig.rightHand.add(this.heldProjectile)
    }
    this.detachedAmmo = []
    this.cloud = null
    this.cloudCaster = null
    this.throwableWeapon = null
    this.meleeWeapon = null
    root.traverse(node => {
      const attachmentRole = node.userData.attachment_role || node.userData.attachmentRole
      if (attachmentRole === "melee-weapon" && !this.meleeWeapon) {
        this.meleeWeapon = node
        this.meleeWeapon.userData.attachmentRole = "melee-weapon"
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
        && ["attack-cloud", "companion-cloud"].includes(attachmentRole)
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
        const targetWorld = root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(.58, 1.32, -.10))
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
    if (this.spawnCactus) this.spawnCactus.visible = false
    this.spawnElapsed = 0
    this.spawnDuration = Math.max(0.9, Number(options.spawnDuration) || 1.45)
    this.aimWeight = 0
    this.aimYaw = 0
    this.aimPitch = 0
    this.appliedUpperAim = new THREE.Quaternion()
    this.appliedHeadAim = new THREE.Quaternion()
    // Rich GLBs already contain authored attack motion. Applying another
    // bind-pose-relative Euler rotation here twists shoulders and makes held
    // weapons drift. Brock's non-skeletal cast remains handled by cloudCaster.
    this.attackPoseNodes = []

    for (const [semanticName, clipName] of Object.entries(clipNames)) {
      const source = THREE.AnimationClip.findByName(clips, clipName)
      if (!source) continue
      const clip = ["aim", "super"].includes(semanticName) && !(semanticName === "super" && options.fullBodySuper)
        ? upperBodyClip(source, this.rig.upperNames)
        : source
      const action = this.mixer.clipAction(clip)
      if (["attack", "super", "spawn"].includes(semanticName)) {
        configureOneShot(action, semanticName === "spawn")
      }
      this.actions.set(semanticName, action)
    }
    for (const semanticName of ["aim", "aimSuper"]) {
      const aim = this.actions.get(semanticName)
      if (!aim) continue
      aim.enabled = true
      aim.setEffectiveWeight(0)
      aim.play()
    }

    this.mixer.addEventListener("finished", event => {
      const finished = [...this.actions.entries()].find(([, action]) => action === event.action)?.[0]
      if (finished === this.overlay) this.overlay = null
      if (finished === "spawn") this.state = null
    })
    if ((this.actions.has("spawn") || this.spawnCactus) && options.spawnOnLoad !== false) this.playSpawn()
  }

  transitionLocomotion(name, fadeSeconds = 0.16) {
    const next = this.actions.get(name)
    if (!next || this.state === name) return Boolean(next)
    const previous = this.actions.get(this.state)
    next.enabled = true
    next.setEffectiveWeight(1)
    next.reset().play()
    if (previous && previous !== next && !["spawn"].includes(this.state)) {
      previous.crossFadeTo(next, fadeSeconds, false)
    }
    this.state = name
    return true
  }

  playOverlay(name, fadeSeconds = 0.04) {
    const next = this.actions.get(name)
    if (!next) return false
    const previous = this.actions.get(this.overlay)
    if (previous && previous !== next) previous.fadeOut(fadeSeconds)
    next.enabled = true
    next.setEffectiveWeight(1)
    next.reset().fadeIn(fadeSeconds).play()
    this.overlay = name
    if (name === "attack" && this.heldProjectile) this.heldProjectile.visible = true
    return true
  }

  playSpawn() {
    this.root.visible = true
    this.spawnElapsed = 0
    const action = this.actions.get("spawn")
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
    if (this.meleeWeapon && input.alive !== false) this.meleeWeapon.visible = true
    this.elapsed += deltaSeconds
    if (input.alive === false) {
      this.root.visible = false
      this.mixer.stopAllAction()
      this.state = "dead"
      this.overlay = null
      return
    }
    if (this.lastSpawnPulse !== input.spawnPulse && input.spawnPulse !== undefined) {
      this.playSpawn()
    } else if (this.state === "dead" && input.alive !== false) {
      this.playSpawn()
    }
    this.lastSpawnPulse = input.spawnPulse

    if (this.lastSuperPulse !== input.superPulse && input.superPulse !== undefined) {
      this.playOverlay("super")
    } else if (this.lastAttackPulse !== input.attackPulse && input.attackPulse !== undefined) {
      this.playOverlay("attack")
      this.attackVisualRemaining = .42
    }
    this.lastAttackPulse = input.attackPulse
    this.lastSuperPulse = input.superPulse
    if (this.cloud && this.cloudBasePosition) {
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
        this.cloudLightning.userData.light.intensity = strike * 5.5
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
    if (input.result && this.actions.has(input.result)) {
      this.transitionLocomotion(input.result, 0.24)
    } else if (this.state !== "spawn") {
      this.transitionLocomotion(input.moving ? "run" : "idle")
    }

    const run = this.actions.get("run")
    if (run) {
      const referenceSpeed = Math.max(1, Number(input.referenceSpeed) || 1)
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
    this.mixer.update(deltaSeconds)
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
      const carrying = this.overlay === "attack" && attack?.isRunning() && phase < 0.52
      this.heldProjectile.visible = Boolean(carrying && this.root.visible)
      if (carrying) {
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
      }
    }
    if (this.rig.upperRoot) {
      this.appliedUpperAim.setFromEuler(new THREE.Euler(
        clamp(this.aimPitch, -0.45, 0.45),
        clamp(this.aimYaw, -1.25, 1.25),
        0,
        "YXZ",
      ))
      this.rig.upperRoot.quaternion.multiply(this.appliedUpperAim)
    } else {
      this.appliedUpperAim.identity()
    }
    if (this.rig.head) {
      this.appliedHeadAim.setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        clamp(this.aimYaw * 0.18, -0.22, 0.22),
      )
      this.rig.head.quaternion.multiply(this.appliedHeadAim)
    } else {
      this.appliedHeadAim.identity()
    }
  }

  setHitFlash(amount) {
    const hit = clamp(amount, 0, 1)
    this.root.traverse(child => {
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      for (const material of materials) {
        if (material?.uniforms?.hit) material.uniforms.hit.value = hit
        if (material?.emissive) {
          if (!material.userData.glbHeroBaseEmissive) material.userData.glbHeroBaseEmissive = material.emissive.clone()
          if (material.userData.glbHeroBaseEmissiveIntensity === undefined) {
            material.userData.glbHeroBaseEmissiveIntensity = material.emissiveIntensity
          }
          material.emissive.copy(material.userData.glbHeroBaseEmissive).lerp(new THREE.Color(0xff2020), hit)
          material.emissiveIntensity = material.userData.glbHeroBaseEmissiveIntensity + hit * 1.8
        }
      }
    })
  }

  dispose() {
    this.mixer.stopAllAction()
    this.mixer.uncacheRoot(this.root)
    this.actions.clear()
  }
}
