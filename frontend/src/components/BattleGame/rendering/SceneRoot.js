import * as THREE from "three"
import {disposeObjectTree} from "./shared/disposal"
import {pixelRatioFor} from "./shared/quality"

export class SceneRoot {
  constructor(canvas, lowQuality) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !lowQuality,
      alpha: false,
      powerPreference: "high-performance",
    })
    this.renderer.setPixelRatio(pixelRatioFor(lowQuality))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.shadowMap.enabled = false
    this.renderer.setClearColor(0xd87850, 1)
    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.Fog(0xe99a65, 42, 105)
    this.roots = {
      map: new THREE.Group(),
      actors: new THREE.Group(),
      projectiles: new THREE.Group(),
      effects: new THREE.Group(),
      aim: new THREE.Group(),
    }
    this.scene.add(...Object.values(this.roots))
  }

  resize(width, height) {
    this.renderer.setSize(width, height, false)
  }

  setLowQuality() {
    this.renderer.setPixelRatio(1)
    this.scene.traverse(child => {
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      for (const material of materials) {
        if (material?.uniforms?.rimStrength) material.uniforms.rimStrength.value = 0
      }
    })
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
