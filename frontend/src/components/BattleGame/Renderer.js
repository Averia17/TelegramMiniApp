import {DEPTH} from "./rendering/config"
import {lerp, project} from "./rendering/graphics"
import {CanvasArenaView} from "./rendering/canvas/CanvasArenaView"
import {CanvasCharacterView} from "./rendering/canvas/CanvasCharacterView"

if (typeof CanvasRenderingContext2D !== "undefined" && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function roundRect(x, y, width, height, radius = 0) {
    const r = Math.min(typeof radius === "number" ? radius : 0, Math.abs(width) / 2, Math.abs(height) / 2)
    this.moveTo(x + r, y)
    this.arcTo(x + width, y, x + width, y + height, r)
    this.arcTo(x + width, y + height, x, y + height, r)
    this.arcTo(x, y + height, x, y, r)
    this.arcTo(x, y, x + width, y, r)
    this.closePath()
    return this
  }
}

const removeMissing = (collection, activeKeys) => {
  collection.forEach((_, key) => {
    if (!activeKeys.has(key)) collection.delete(key)
  })
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas
    this.ctx = canvas.getContext("2d")
    if (!this.ctx) throw new Error("Canvas2D is unavailable")
    this.arena = new CanvasArenaView()
    this.players = new Map()
    this.state = null
    this.localPlayerId = null
    this.camera = {x: null, y: null}
    this.time = 0
    this.lastRenderAt = performance.now()
    this.knownBullets = new Set()
    this.particles = []
    this.shake = 0
    this.resize(window.innerWidth, window.innerHeight)
  }

  setState(state) {
    if (!state) return
    this.state = state
    this.arena.setMap(state.map)
    const activePlayers = new Set(Object.keys(state.players || {}))
    Object.entries(state.players || {}).forEach(([id, player]) => {
      let view = this.players.get(id)
      if (!view) {
        view = new CanvasCharacterView(player)
        this.players.set(id, view)
      }
      view.setState(player)
    })
    removeMissing(this.players, activePlayers)
    this.syncShots(state.bullets || [])
  }

  syncShots(bullets) {
    const active = new Set()
    bullets.forEach((bullet, index) => {
      const key = `${bullet.playerId || "bullet"}:${index}`
      active.add(key)
      if (!this.knownBullets.has(key)) {
        this.players.get(String(bullet.playerId))?.triggerRecoil()
        if (String(bullet.playerId) === String(this.localPlayerId)) this.shake = Math.max(this.shake, 4.5)
        this.spawnMuzzle(bullet)
      }
    })
    this.knownBullets = active
  }

  setLocalPlayerId(id) {
    this.localPlayerId = id
    const local = this.players.get(String(id))
    if (local) {
      const point = project(local.worldX, local.worldY)
      this.camera.x = point.x
      this.camera.y = point.y - 34
    }
  }

  resize(width, height) {
    this.width = Math.max(1, Math.round(width))
    this.height = Math.max(1, Math.round(height))
    if (this.canvas.width !== this.width) this.canvas.width = this.width
    if (this.canvas.height !== this.height) this.canvas.height = this.height
    this.zoom = this.width < 700 ? 1.05 : 1.2
  }

  render() {
    const now = performance.now()
    const delta = Math.min(Math.max((now - this.lastRenderAt) / 1000, 1 / 240), 0.05)
    this.lastRenderAt = now
    this.time += delta
    this.players.forEach(view => view.update(delta))
    this.updateParticles(delta)
    this.shake *= Math.exp(-18 * delta)
    this.updateCamera(delta)
    this.draw()
  }

  updateCamera(delta) {
    const local = this.players.get(String(this.localPlayerId))
    let targetX = this.arena.map.width / 2
    let targetY = this.arena.map.height * DEPTH / 2
    if (local) {
      const point = project(local.worldX, local.worldY)
      targetX = point.x
      targetY = point.y - 34
    }
    this.camera.x ??= targetX
    this.camera.y ??= targetY
    const blend = 1 - Math.exp(-7 * delta)
    this.camera.x = lerp(this.camera.x, targetX, blend)
    this.camera.y = lerp(this.camera.y, targetY, blend)
  }

  draw() {
    const ctx = this.ctx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.width, this.height)
    ctx.fillStyle = "#e6b85f"
    ctx.fillRect(0, 0, this.width, this.height)
    ctx.save()
    const shakeX = (Math.random() - 0.5) * this.shake
    const shakeY = (Math.random() - 0.5) * this.shake
    ctx.translate(this.width / 2 + shakeX, this.height / 2 + 42 + shakeY)
    ctx.scale(this.zoom, this.zoom)
    ctx.translate(-this.camera.x, -this.camera.y)
    this.arena.drawGround(ctx)

    const depthItems = this.arena.getDepthItems()
    this.players.forEach((view, id) => {
      depthItems.push({
        depth: view.depth,
        draw: drawContext => view.draw(drawContext, this.time, String(id) === String(this.localPlayerId)),
      })
    })
    Object.entries(this.state?.monsters || {}).forEach(([id, monster]) => {
      depthItems.push({depth: monster.y * DEPTH, draw: drawContext => this.drawMonster(drawContext, monster, id)})
    })
    ;(this.state?.props || []).forEach((prop, index) => {
      depthItems.push({depth: prop.y * DEPTH, draw: drawContext => this.drawPickup(drawContext, prop, index)})
    })
    depthItems.sort((a, b) => a.depth - b.depth)
    depthItems.forEach(item => item.draw(ctx))
    ;(this.state?.bullets || []).forEach(bullet => this.drawBullet(ctx, bullet))
    this.particles.forEach(particle => this.drawParticle(ctx, particle))
    ctx.restore()
  }

  spawnMuzzle(bullet) {
    if (!bullet) return
    for (let i = 0; i < 7; i += 1) {
      const angle = (bullet.rotation || 0) + (Math.random() - 0.5) * 0.9
      this.particles.push({
        x: bullet.x, y: bullet.y, z: 28, age: 0, life: 0.16 + Math.random() * 0.16,
        vx: Math.cos(angle) * (35 + Math.random() * 80),
        vy: Math.sin(angle) * (35 + Math.random() * 80),
        vz: (Math.random() - 0.2) * 45,
        size: 2 + Math.random() * 4,
      })
    }
  }

  updateParticles(delta) {
    this.particles.forEach(particle => {
      particle.age += delta
      particle.x += particle.vx * delta
      particle.y += particle.vy * delta
      particle.z += particle.vz * delta
      particle.vz -= 150 * delta
    })
    this.particles = this.particles.filter(particle => particle.age < particle.life)
  }

  drawParticle(ctx, particle) {
    const point = project(particle.x, particle.y)
    const alpha = 1 - particle.age / particle.life
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.fillStyle = particle.age < particle.life * 0.45 ? "#fff6b0" : "#ff8b32"
    ctx.beginPath()
    ctx.arc(point.x, point.y - particle.z, particle.size * alpha, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  drawMonster(ctx, monster, id) {
    const point = project(monster.x, monster.y)
    const phase = this.time * 5 + String(id).length
    ctx.save()
    ctx.translate(point.x, point.y)
    ctx.scale(1, 1 + Math.sin(phase) * 0.05)
    ctx.fillStyle = "rgba(22,37,54,.3)"
    ctx.beginPath(); ctx.ellipse(0, 3, 23, 8, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = "#6e3d9e"
    ctx.beginPath(); ctx.ellipse(0, -22, 23, 27, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = "#9d62d0"
    ctx.beginPath(); ctx.ellipse(-7, -31, 12, 13, 0, 0, Math.PI * 2); ctx.fill()
    this.drawEye(ctx, -8, -25)
    this.drawEye(ctx, 8, -25)
    ctx.fillStyle = "#54327c"
    ctx.beginPath(); ctx.roundRect(-20, -7, 12, 14, 6); ctx.roundRect(8, -7, 12, 14, 6); ctx.fill()
    ctx.restore()
  }

  drawEye(ctx, x, y) {
    ctx.fillStyle = "#ffffff"
    ctx.beginPath(); ctx.ellipse(x, y, 7, 8, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = "#27213e"
    ctx.beginPath(); ctx.ellipse(x + 1, y + 1, 3, 4, 0, 0, Math.PI * 2); ctx.fill()
  }

  drawPickup(ctx, prop, index) {
    const point = project(prop.x, prop.y)
    const phase = this.time * 3 + index
    const color = prop.type === "health" || prop.type === "potion-red" ? "#5be16c" : prop.type === "ammo" ? "#ffcb3d" : "#a765ff"
    ctx.save()
    ctx.translate(point.x, point.y - 8 - Math.sin(phase) * 3)
    ctx.fillStyle = "rgba(24,48,68,.24)"
    ctx.beginPath(); ctx.ellipse(0, 13, 14, 5, 0, 0, Math.PI * 2); ctx.fill()
    ctx.shadowColor = color
    ctx.shadowBlur = 12
    ctx.fillStyle = color
    ctx.beginPath(); ctx.roundRect(-10, -10, 20, 20, 6); ctx.fill()
    ctx.shadowBlur = 0
    ctx.strokeStyle = "#ffffff"
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.moveTo(0, -5); ctx.lineTo(0, 5); ctx.stroke()
    ctx.restore()
  }

  drawBullet(ctx, bullet) {
    const point = project(bullet.x, bullet.y)
    const rotation = Math.atan2(Math.sin(bullet.rotation || 0) * DEPTH, Math.cos(bullet.rotation || 0))
    const color = bullet.color || "#ffdd42"
    ctx.save()
    ctx.translate(point.x, point.y - 32)
    ctx.rotate(rotation)
    const gradient = ctx.createLinearGradient(-20, 0, 8, 0)
    gradient.addColorStop(0, "rgba(255,255,255,0)")
    gradient.addColorStop(1, color)
    ctx.strokeStyle = gradient
    ctx.lineCap = "round"
    ctx.lineWidth = 9
    ctx.beginPath(); ctx.moveTo(-30, 0); ctx.lineTo(0, 0); ctx.stroke()
    ctx.globalAlpha = 0.3
    ctx.fillStyle = color
    ctx.beginPath(); ctx.ellipse(-5, 0, 16, 10, 0, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1
    ctx.fillStyle = color
    ctx.beginPath(); ctx.ellipse(0, 0, 7, 5, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = "#ffffff"
    ctx.beginPath(); ctx.ellipse(1, -1, 3.5, 2.5, 0, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  }

  destroy() {
    this.players.clear()
    this.knownBullets.clear()
    this.state = null
  }
}
