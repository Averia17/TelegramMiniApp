import * as THREE from "three"
import {disposeObjectTree} from "./shared/disposal.js"
import {isSoftwareWebGLContext, pixelRatioFor} from "./shared/quality.js"

export const getBattleWebGLContext = (canvas, lowQuality) => {
  const attributes = {
    alpha: false,
    antialias: !lowQuality,
    depth: true,
    stencil: false,
    powerPreference: "high-performance",
    preserveDrawingBuffer: false,
  }
  const context = canvas?.getContext?.("webgl2", attributes)
    || canvas?.getContext?.("webgl", attributes)
  if (!context || context.isContextLost?.()) {
    throw new Error("Battle WebGL context is unavailable; preview contexts may still be allocated")
  }
  return context
}

export class SceneRoot {
  constructor(canvas, lowQuality) {
    const context = getBattleWebGLContext(canvas, lowQuality)
    this.softwareWebGL = isSoftwareWebGLContext(context)
    this.lowQuality = Boolean(lowQuality)
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      context,
      antialias: !this.lowQuality,
      alpha: false,
      powerPreference: "high-performance",
      precision: this.lowQuality ? "mediump" : "highp",
    })
    this.renderer.setPixelRatio(pixelRatioFor(this.lowQuality, this.softwareWebGL))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = this.lowQuality ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.08
    this.renderer.shadowMap.enabled = !this.lowQuality
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.setClearColor(0xd87850, 1)
    this.scene = new THREE.Scene()
    this.scene.fog = this.lowQuality ? null : new THREE.Fog(0xe99a65, 42, 105)
    this.fillLight = new THREE.HemisphereLight(0xcde9ff, 0x70452f, 1.65)
    this.keyLight = new THREE.DirectionalLight(0xfff3df, 3.1)
    this.keyLight.position.set(-8, 16, 10)
    this.keyLight.castShadow = !this.lowQuality
    this.keyLight.shadow.mapSize.set(1024, 1024)
    this.keyLight.shadow.camera.near = 1
    this.keyLight.shadow.camera.far = 75
    this.keyLight.shadow.camera.left = -18
    this.keyLight.shadow.camera.right = 18
    this.keyLight.shadow.camera.top = 18
    this.keyLight.shadow.camera.bottom = -18
    this.keyLight.shadow.bias = -0.0004
    this.keyLight.shadow.normalBias = 0.025
    this.scene.add(this.fillLight, this.keyLight, this.keyLight.target)
    this.roots = {
      map: new THREE.Group(),
      actors: new THREE.Group(),
      pickups: new THREE.Group(),
      projectiles: new THREE.Group(),
      effects: new THREE.Group(),
      aim: new THREE.Group(),
    }
    this.scene.add(...Object.values(this.roots))
    this.lightDirection = new THREE.Vector3()
    this.lightFocus = new THREE.Vector3()
    this.lightOffset = new THREE.Vector3(-8, 16, 10)
  }

  resize(width, height) {
    this.renderer.setSize(width, height, false)
  }

  setLowQuality() {
    this.lowQuality = true
    this.renderer.setPixelRatio(pixelRatioFor(true, this.softwareWebGL))
    this.renderer.toneMapping = THREE.NoToneMapping
    this.scene.fog = null
    this.renderer.shadowMap.enabled = false
    this.keyLight.castShadow = false
    this.scene.traverse(child => {
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      for (const material of materials) {
        if (material?.uniforms?.rimStrength) material.uniforms.rimStrength.value = 0
      }
    })
  }

  render(camera) {
    camera.getWorldDirection(this.lightDirection)
    this.lightFocus.copy(camera.position).addScaledVector(this.lightDirection, 54)
    this.keyLight.position.copy(this.lightFocus).add(this.lightOffset)
    this.keyLight.target.position.copy(this.lightFocus)
    this.keyLight.target.updateMatrixWorld()
    this.renderer.render(this.scene, camera)
  }

  dispose() {
    disposeObjectTree(this.scene)
    this.renderer.dispose()
    this.renderer.forceContextLoss?.()
  }
}
