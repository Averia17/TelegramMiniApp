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
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.08
    this.renderer.shadowMap.enabled = !lowQuality
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.setClearColor(0xd87850, 1)
    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.Fog(0xe99a65, 42, 105)
    this.fillLight = new THREE.HemisphereLight(0xcde9ff, 0x70452f, 1.65)
    this.keyLight = new THREE.DirectionalLight(0xfff3df, 3.1)
    this.keyLight.position.set(-8, 16, 10)
    this.keyLight.castShadow = !lowQuality
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
    const direction = new THREE.Vector3()
    camera.getWorldDirection(direction)
    const focus = camera.position.clone().addScaledVector(direction, 54)
    this.keyLight.position.copy(focus).add(new THREE.Vector3(-8, 16, 10))
    this.keyLight.target.position.copy(focus)
    this.keyLight.target.updateMatrixWorld()
    this.renderer.render(this.scene, camera)
  }

  dispose() {
    disposeObjectTree(this.scene)
    this.renderer.dispose()
    this.renderer.forceContextLoss?.()
  }
}
