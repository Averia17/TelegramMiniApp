import * as THREE from "three"
import {disposeObjectTree} from "./shared/disposal.js"
import {getTelegramGraphicsProfile} from "../../../utils/telegramDeviceProfile.js"

export const getBattleWebGLContext = (canvas, graphicsProfile = getTelegramGraphicsProfile()) => {
  const attributes = {
    alpha: false,
    antialias: graphicsProfile.antialias,
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
    const graphicsProfile = getTelegramGraphicsProfile()
    const context = getBattleWebGLContext(canvas, graphicsProfile)
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      context,
      antialias: graphicsProfile.antialias,
      alpha: false,
      powerPreference: "high-performance",
      precision: "highp",
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, graphicsProfile.maxPixelRatio))
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
    this.teamAtmosphereKey = null
  }

  setTeamAtmosphere(enabled, mapName = "") {
    const northernTeamMap = enabled && /team-battle-northern/i.test(String(mapName))
    const atmosphereKey = `${Boolean(enabled)}:${northernTeamMap}`
    if (this.teamAtmosphereKey === atmosphereKey) return
    this.teamAtmosphereKey = atmosphereKey
    if (enabled) {
      if (northernTeamMap) {
        // Northern Ash intentionally keeps the colder, darker castle grade;
        // only the classic team map gets the brighter daylight treatment.
        this.renderer.setClearColor(0x26302d, 1)
        this.scene.fog.color.setHex(0x4b5147)
        this.scene.fog.near = 28
        this.scene.fog.far = 86
        this.fillLight.color.setHex(0xb9c9c0)
        this.fillLight.groundColor.setHex(0x302922)
        this.fillLight.intensity = 1.35
        this.keyLight.color.setHex(0xffd2a7)
        this.keyLight.intensity = 2.35
        return
      }
      // The classic team map retains the previous commit's brighter daylight
      // presentation instead of inheriting the Northern Ash night grade.
      this.renderer.setClearColor(0x64746d, 1)
      this.scene.fog.color.setHex(0x738076)
      this.scene.fog.near = 48
      this.scene.fog.far = 128
      this.fillLight.color.setHex(0xd2e0d5)
      this.fillLight.groundColor.setHex(0x5b594c)
      this.fillLight.intensity = 1.72
      this.keyLight.color.setHex(0xffe0bb)
      this.keyLight.intensity = 2.85
      return
    }
    this.renderer.setClearColor(0xd87850, 1)
    this.scene.fog.color.setHex(0xe99a65)
    this.scene.fog.near = 42
    this.scene.fog.far = 105
    this.fillLight.color.setHex(0xcde9ff)
    this.fillLight.groundColor.setHex(0x70452f)
    this.fillLight.intensity = 1.65
    this.keyLight.color.setHex(0xfff3df)
    this.keyLight.intensity = 3.1
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
