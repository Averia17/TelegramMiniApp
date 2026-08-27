import * as THREE from "three"
import {WORLD_SCALE} from "../shared/coordinates.js"
import {disposeObjectTree} from "../shared/disposal.js"

const GROUND_COLORS = Object.freeze({default: 0x4f9b50, island: 0x3d8a4d, team: 0x59664f})

const createGrassTexture = (theme = "default") => {
  const size = 128
  const isTeam = theme === "team"
  const canvas = typeof document === "undefined" ? null : document.createElement("canvas")
  if (canvas) {
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext("2d")
    context.fillStyle = isTeam ? "#c2bea0" : "#f3f1dc"
    context.fillRect(0, 0, size, size)
    let seed = 918273
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 0x100000000
    }
    const meadowPatchCount = 44
    for (let index = 0; index < meadowPatchCount; index += 1) {
      const centerX = random() * size
      const centerY = random() * size
      const radiusX = 7 + random() * 13
      const radiusY = 4 + random() * 8
      const points = 6 + Math.floor(random() * 3)
      context.fillStyle = isTeam
        ? (index % 4 === 0 ? "rgba(45,66,48,.22)" : index % 3 === 0 ? "rgba(108,91,63,.14)" : "rgba(194,182,120,.10)")
        : index % 3 === 0 ? "rgba(58,126,61,.09)" : "rgba(226,224,151,.10)"
      context.beginPath()
      for (let point = 0; point < points; point += 1) {
        const angle = (point / points) * Math.PI * 2
        const wobble = .78 + random() * .35
        const x = centerX + Math.cos(angle) * radiusX * wobble
        const y = centerY + Math.sin(angle) * radiusY * wobble
        if (point === 0) context.moveTo(x, y)
        else context.lineTo(x, y)
      }
      context.closePath()
      context.fill()
    }
    for (let index = 0; index < 520; index += 1) {
      const x = random() * size
      const y = random() * size
      const height = 1.5 + random() * 4
      context.strokeStyle = isTeam
        ? (random() > .48 ? "rgba(69,91,57,.38)" : "rgba(177,164,111,.28)")
        : random() > .48 ? "rgba(116,156,74,.32)" : "rgba(204,214,137,.30)"
      context.lineWidth = .55 + random() * .65
      context.beginPath()
      context.moveTo(x, y)
      context.quadraticCurveTo(x - 1 + random() * 2, y - height * .6, x - 1 + random() * 2, y - height)
      context.stroke()
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.userData.meadowPatchCount = meadowPatchCount
    texture.userData.grassBladeCount = 520
    texture.userData.theme = theme
    return texture
  }

  const data = new Uint8Array(size * size * 4)
  for (let index = 0; index < size * size; index += 1) {
    const value = 226 + (index * 17) % 26
    data[index * 4] = value
    data[index * 4 + 1] = value
    data[index * 4 + 2] = value - 10
    data[index * 4 + 3] = 255
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  texture.needsUpdate = true
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.minFilter = THREE.LinearFilter
  texture.userData.meadowPatchCount = 44
  texture.userData.grassBladeCount = 520
  texture.userData.theme = theme
  return texture
}

export const createWaterTexture = () => {
  const canvas = document.createElement("canvas")
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext("2d")
  context.fillStyle = "#249ed7"
  context.fillRect(0, 0, 64, 64)
  context.strokeStyle = "rgba(180,239,255,.45)"
  context.lineWidth = 4
  for (let y = 8; y < 64; y += 20) {
    context.beginPath()
    context.moveTo(-8, y)
    context.quadraticCurveTo(16, y - 7, 36, y)
    context.quadraticCurveTo(52, y + 6, 72, y)
    context.stroke()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(2, 2)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export class GroundRenderer {
  constructor(root) {
    this.root = root
    this.mesh = null
    this.texture = null
    this.theme = "default"
  }

  sync(width, height, theme = this.theme, excludedAreas = []) {
    const sceneWidth = width * WORLD_SCALE
    const sceneHeight = height * WORLD_SCALE
    const exclusions = excludedAreas.map(area => `${area.minX}:${area.minY}:${area.maxX}:${area.maxY}`).join("|")
    const size = `${sceneWidth}:${sceneHeight}:${theme}:${exclusions}`
    if (this.mesh?.userData.size === size) return
    if (this.mesh) {
      this.root.remove(this.mesh)
      disposeObjectTree(this.mesh)
    }
    this.theme = theme
    this.texture = createGrassTexture(theme)
    this.texture.repeat.set(Math.max(1, sceneWidth / 6), Math.max(1, sceneHeight / 6))
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(sceneWidth, sceneHeight),
      new THREE.MeshStandardMaterial({
        color: GROUND_COLORS[theme] || GROUND_COLORS.default,
        map: this.texture,
        roughness: 1,
        metalness: 0,
      }),
    )
    this.mesh.rotation.x = -Math.PI / 2
    this.mesh.position.set(sceneWidth / 2, 0, sceneHeight / 2)
    this.mesh.receiveShadow = true
    this.mesh.userData.size = size
    this.mesh.userData.role = "grass-ground"
    this.root.add(this.mesh)
  }

  setTheme(theme) {
    if (!this.mesh || this.theme === theme) return
    this.theme = theme
    this.texture?.dispose?.()
    this.texture = createGrassTexture(theme)
    const {width, height} = this.mesh.geometry.parameters
    this.texture.repeat.set(Math.max(1, width / 6), Math.max(1, height / 6))
    this.mesh.material.map = this.texture
    this.mesh.material.color.setHex(GROUND_COLORS[theme] || GROUND_COLORS.default)
    this.mesh.material.needsUpdate = true
  }
}
