import * as THREE from "three"
import {WORLD_SCALE} from "../shared/coordinates.js"
import {disposeObjectTree} from "../shared/disposal.js"
import {flatMaterial} from "../shared/materials.js"

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
    this.theme = "default"
  }

  sync(width, height, theme = this.theme) {
    const sceneWidth = width * WORLD_SCALE
    const sceneHeight = height * WORLD_SCALE
    const size = `${sceneWidth}:${sceneHeight}:${theme}`
    if (this.mesh?.userData.size === size) return
    if (this.mesh) {
      this.root.remove(this.mesh)
      disposeObjectTree(this.mesh)
    }
    this.theme = theme
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(sceneWidth, sceneHeight), flatMaterial(theme === "island" ? 0x1ca8bd : 0xe89a61))
    this.mesh.rotation.x = -Math.PI / 2
    this.mesh.position.set(sceneWidth / 2, 0, sceneHeight / 2)
    this.mesh.userData.size = size
    this.root.add(this.mesh)
  }

  setTheme(theme) {
    if (!this.mesh || this.theme === theme) return
    this.theme = theme
    this.mesh.material.color.setHex(theme === "island" ? 0x1ca8bd : 0xe89a61)
  }
}
