import * as THREE from "three"
import {disposeObjectTree} from "./shared/disposal.js"

export const getBattleWebGLContext = canvas => {
  const attributes = {
    alpha: false,
    antialias: true,
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
  constructor(canvas) {
    const context = getBattleWebGLContext(canvas)
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      context,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      precision: "highp",
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.08
    // The shadow camera used to follow the gameplay camera, creating a large
    // lighting/shadow pool that travelled with the local hero and became
    // obvious as props crossed its boundary. Keep PBR lighting, but use the
    // existing compact contact shadows instead of a moving shadow map.
    this.renderer.shadowMap.enabled = false
    this.renderer.setClearColor(0xd87850, 1)
    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.Fog(0xe99a65, 42, 105)
    this.fillLight = new THREE.HemisphereLight(0xcde9ff, 0x70452f, 1.65)
    this.keyLight = new THREE.DirectionalLight(0xfff3df, 3.1)
    this.keyLight.position.set(-8, 16, 10)
    this.keyLight.castShadow = false
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
  }

  resize(width, height) {
    this.renderer.setSize(width, height, false)
  }

  render(camera) {
    this.renderer.render(this.scene, camera)
  }

  dispose() {
    disposeObjectTree(this.scene)
    this.renderer.dispose()
    this.renderer.forceContextLoss?.()
  }
}
