import {DEPTH} from "./rendering/config"
import {clamp, lerp, project} from "./rendering/graphics"
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

const bushAt = (player, walls = []) => walls.find(wall =>
  (wall.type === "bush" || wall.type === "half") &&
  player.x >= wall.minX && player.x <= wall.maxX && player.y >= wall.minY && player.y <= wall.maxY)

const sharesBush = (a, b) => a && b && (a === b || (a.bushGroup !== undefined && a.bushGroup === b.bushGroup))

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
    if (state.combatShake) {
      this.shake = Math.max(this.shake, state.combatShake)
      state.combatShake = 0
    }
    this.arena.setMap(state.map)
    this.arena.setVisibilityContext(state.players?.[this.localPlayerId], Object.entries(state.players || {}).filter(([id]) => String(id) !== String(this.localPlayerId)).map(([, player]) => player))
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
        this.players.get(String(bullet.playerId))?.reveal(1000)
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
    this.updateBushVisibility(now)
    this.players.forEach((view, id) => view.update(delta, String(id) === String(this.localPlayerId)))
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
      const halfWidth = this.width / (2 * this.zoom)
      const halfHeight = this.height / (2 * this.zoom)
      const mapWidth = this.arena.map.width
      const mapHeight = this.arena.map.height * DEPTH
      targetX = mapWidth > halfWidth * 2 ? clamp(targetX, halfWidth, mapWidth - halfWidth) : mapWidth / 2
      targetY = mapHeight > halfHeight * 2 ? clamp(targetY, halfHeight, mapHeight - halfHeight) : mapHeight / 2
      this.camera.x = targetX
      this.camera.y = targetY
      return
    }
    this.camera.x ??= targetX
    this.camera.y ??= targetY
    const blend = 1 - Math.exp(-7 * delta)
    this.camera.x = lerp(this.camera.x, targetX, blend)
    this.camera.y = lerp(this.camera.y, targetY, blend)
  }

  draw() {
    const ctx = this.ctx
    this.arena.time = this.time
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.width, this.height)
    // Match the arena floor outside the finite map bounds. On wide desktop
    // viewports the camera can see past a spawn-side edge; a different fill
    // color made that area look like a broken, skewed map.
    ctx.fillStyle = "#ee9862"
    ctx.fillRect(0, 0, this.width, this.height)
    ctx.save()
    const shakeX = (Math.random() - 0.5) * this.shake
    const shakeY = (Math.random() - 0.5) * this.shake
    ctx.translate(this.width / 2 + shakeX, this.height / 2 + 42 + shakeY)
    ctx.scale(this.zoom, this.zoom)
    ctx.translate(-this.camera.x, -this.camera.y)
    this.arena.drawGround(ctx)
    this.drawAimGuide(ctx)

    const depthItems = this.arena.getDepthItems()
    if (!this.externalCharacterLayer) this.players.forEach((view, id) => {
      depthItems.push({depth:view.depth,draw:drawContext=>view.draw(drawContext,this.time,String(id)===String(this.localPlayerId))})
    })
    Object.entries(this.state?.monsters || {}).forEach(([id, monster]) => {
      depthItems.push({depth: monster.y * DEPTH, draw: drawContext => this.drawMonster(drawContext, monster, id)})
    })
    ;(this.state?.props || []).forEach((prop, index) => {
      depthItems.push({depth: prop.y * DEPTH, draw: drawContext => this.drawPickup(drawContext, prop, index)})
    })
    // Stable back-to-front painter's order. The sequence fallback prevents
    // equal-Y walls and actors from flickering between animation frames.
    depthItems.forEach((item, sequence) => { item.sequence = sequence })
    depthItems.sort((a, b) => a.depth - b.depth || a.sequence - b.sequence)
    depthItems.forEach(item => item.draw(ctx))
    ;(this.state?.bullets || []).forEach(bullet => this.drawBullet(ctx, bullet))
    ;(this.state?.effects || []).forEach(effect => this.drawEffect(ctx, effect))
    this.particles.forEach(particle => this.drawParticle(ctx, particle))
    ctx.restore()
    const local=this.state?.players?.[this.localPlayerId]
    if(local?.blind>0){ctx.save();ctx.fillStyle=`rgba(28,8,43,${Math.min(.82,.48+local.blind*.22)})`;ctx.fillRect(0,0,this.width,this.height);ctx.globalCompositeOperation="destination-out";const glow=ctx.createRadialGradient(this.width/2,this.height/2,20,this.width/2,this.height/2,115);glow.addColorStop(0,"rgba(0,0,0,.9)");glow.addColorStop(1,"rgba(0,0,0,0)");ctx.fillStyle=glow;ctx.fillRect(0,0,this.width,this.height);ctx.restore()}
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
    const health = Math.max(0, Math.min(1, (monster.lives ?? 1) / (monster.maxLives || monster.lives || 1)))
    ctx.fillStyle = "#19213c"; ctx.beginPath(); ctx.roundRect(-24, -58, 48, 8, 4); ctx.fill()
    ctx.fillStyle = health < .4 ? "#ff4b57" : "#63df59"; ctx.beginPath(); ctx.roundRect(-21, -55, 42 * health, 3, 2); ctx.fill()
    ctx.textAlign = "center"; ctx.font = "800 9px Arial"; ctx.lineWidth = 3; ctx.strokeStyle = "#18213d"; ctx.strokeText("ДИКИЙ ЗВЕРЬ", 0, -65); ctx.fillStyle = "#fff"; ctx.fillText("ДИКИЙ ЗВЕРЬ", 0, -65)
    ctx.restore()
  }

  updateBushVisibility(now) {
    const local = this.state?.players?.[this.localPlayerId]
    const walls = this.state?.map?.walls || []
    if (!local) return
    const localBush = bushAt(local, walls)
    this.players.forEach((view, id) => {
      if (String(id) === String(this.localPlayerId)) {
        view.targetVisibility = 1
        return
      }
      const enemy = this.state?.players?.[id]
      const enemyBush = enemy && bushAt(enemy, walls)
      const closeEnough = enemy && Math.hypot(enemy.x - local.x, enemy.y - local.y) <= Math.max(90, (this.state.map.tileSize || 40) * 2.5)
      const concealed = enemyBush && !closeEnough && !sharesBush(localBush, enemyBush) && now >= view.revealedUntil
      view.targetVisibility = concealed ? 0 : 1
    })
  }

  isPlayerVisible(id) {
    if (String(id) === String(this.localPlayerId)) return true
    const player = this.state?.players?.[id]
    const view = this.players.get(String(id))
    if (!player || !view || view.targetVisibility < .5) return false

    const point = project(player.x, player.y)
    const screenX = (point.x - this.camera.x) * this.zoom + this.width / 2
    const screenY = (point.y - this.camera.y) * this.zoom + this.height / 2 + 42
    const margin = Math.max(24, (player.radius || 14) * this.zoom * 2)
    return screenX >= -margin && screenX <= this.width + margin &&
      screenY >= -margin && screenY <= this.height + margin
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
    const size = bullet.size || 7
    const gradient = ctx.createLinearGradient(-20 - size, 0, 8, 0)
    gradient.addColorStop(0, "rgba(255,255,255,0)")
    gradient.addColorStop(1, color)
    ctx.strokeStyle = gradient
    ctx.lineCap = "round"
    ctx.lineWidth = bullet.kind === "wave" ? 16 : Math.max(7, size * .8)
    ctx.beginPath(); ctx.moveTo(-24 - size, 0); ctx.lineTo(0, 0); ctx.stroke()
    ctx.globalAlpha = 0.3
    ctx.fillStyle = color
    ctx.beginPath(); ctx.ellipse(-5, 0, size * 1.8, size, 0, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1
    ctx.fillStyle = color
    if (bullet.kind === "rock") ctx.fillStyle = "#8c674e"
    ctx.beginPath(); ctx.ellipse(0, 0, size, size * (bullet.kind === "wave" ? .35 : .72), 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = "#ffffff"
    ctx.beginPath(); ctx.ellipse(1, -1, 3.5, 2.5, 0, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  }

  drawAimGuide(ctx) {
    const player = this.state?.players?.[this.localPlayerId]
    if (!player || player.dead || !player.aiming) return
    const hero = String(player.hero || "blaze").toLowerCase()
    const ranges = {blaze: 430, frost: 225, viper: 112, titan: 155, shadow: 500, spark: 390, nova: 460, rex: 92, pixel: 650, boulder: 480}
    const melee = ["frost", "viper", "titan", "rex"].includes(hero)
    const range = ranges[hero] || 430
    const start = project(player.x, player.y)
    const angle = player.rotation || 0
    const end = project(player.x + Math.cos(angle) * range, player.y + Math.sin(angle) * range)
    const screenAngle = Math.atan2(end.y - start.y, end.x - start.x)
    ctx.save(); ctx.translate(start.x, start.y - 24); ctx.rotate(screenAngle)
    ctx.fillStyle = "rgba(255,255,255,.16)"; ctx.strokeStyle = "rgba(255,255,255,.78)"; ctx.lineWidth = 3
    if (melee) {
      const width = hero === "titan" ? range : range * .72
      ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(range, -width); ctx.quadraticCurveTo(range * 1.08, 0, range, width); ctx.closePath(); ctx.fill(); ctx.stroke()
    } else {
      const half = hero === "boulder" || hero === "nova" ? 26 : hero === "blaze" ? 38 : 12
      ctx.beginPath(); ctx.moveTo(20, -8); ctx.lineTo(range, -half); ctx.lineTo(range, half); ctx.lineTo(20, 8); ctx.closePath(); ctx.fill(); ctx.stroke()
    }
    ctx.restore()
  }

  drawEffect(ctx, effect) {
    const point = project(effect.x, effect.y)
    const progress = Math.max(0, Math.min(1, 1 - effect.life / (effect.maxLife || .45)))
    const alpha = Math.max(0, 1 - progress)
    ctx.save(); ctx.globalAlpha = alpha
    ctx.strokeStyle = effect.color || "#fff"; ctx.fillStyle = effect.color || "#fff"
    ctx.lineCap = "round"; ctx.lineJoin = "round"
    if (["slash", "bite", "cone"].includes(effect.kind)) {
      const rotation = Math.atan2(Math.sin(effect.angle || 0) * DEPTH, Math.cos(effect.angle || 0))
      const range = effect.range || 120
      ctx.translate(point.x, point.y - 28); ctx.rotate(rotation)
      if (effect.kind === "cone") {
        ctx.globalAlpha = alpha * .25
        ctx.beginPath(); ctx.moveTo(12, 0); ctx.arc(0, 0, range * (.65 + progress * .35), -(effect.arc || .7), effect.arc || .7); ctx.closePath(); ctx.fill()
      } else {
        ctx.lineWidth = effect.kind === "bite" ? 18 : 12
        ctx.beginPath(); ctx.arc(0, 0, range * (.55 + progress * .45), -(effect.arc || .8), effect.arc || .8); ctx.stroke()
        if (effect.kind === "bite") { ctx.beginPath(); ctx.arc(0, 0, range * .75, -.65, -.18); ctx.arc(0, 0, range * .75, .18, .65); ctx.stroke() }
      }
    } else if (["damage","heal","evade"].includes(effect.kind)) {
      const bounce = Math.sin(Math.min(1, progress * 1.7) * Math.PI)
      const magnitude=typeof effect.damage==="number"?Math.min(.8,Math.sqrt(effect.damage)/85):.15
      const scale = .68 + magnitude + bounce * .42
      ctx.translate(point.x, point.y - 72 - progress * 42)
      ctx.scale(scale, scale)
      ctx.globalAlpha = Math.min(1, alpha * 1.8)
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = "900 25px Arial"
      const label=effect.kind==="heal"?`+${effect.damage}`:effect.kind==="evade"?"EVADE!":`-${effect.damage}`
      ctx.lineWidth = 7; ctx.strokeStyle = effect.kind==="heal"?"#145b34":"#6b1837"; ctx.strokeText(label,0,0)
      ctx.fillStyle = effect.color || "#fff"; ctx.fillText(label,0,0)
    } else if (["beam", "lightning", "grapple"].includes(effect.kind)) {
      const end = project(effect.toX, effect.toY)
      ctx.lineWidth = effect.kind === "beam" ? 10 : effect.kind==="grapple"?4:6
      ctx.shadowColor = effect.color; ctx.shadowBlur = 18
      ctx.beginPath(); ctx.moveTo(point.x, point.y - 32)
      if (effect.kind === "lightning") {
        const steps = 7
        for (let i = 1; i < steps; i += 1) {
          const t = i / steps
          ctx.lineTo(point.x + (end.x - point.x) * t + (Math.random() - .5) * 18, point.y + (end.y - point.y) * t - 32 + (Math.random() - .5) * 14)
        }
      }
      ctx.lineTo(end.x, end.y - 32); ctx.stroke()
      ctx.strokeStyle = "#fff"; ctx.lineWidth *= .3; ctx.stroke()
    } else if(effect.kind==="clone"){
      ctx.translate(point.x,point.y-34);ctx.globalAlpha=alpha*.62;ctx.fillStyle="#d9a6ff";ctx.beginPath();ctx.ellipse(0,8,24,10,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(0,-16,17,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#fff";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-28,14);ctx.quadraticCurveTo(0,38,28,14);ctx.stroke()
    } else {
      ctx.lineWidth = 12 * (1 - progress) + 2
      ctx.beginPath(); ctx.ellipse(point.x, point.y, (effect.radius || 80) * progress, (effect.radius || 80) * DEPTH * progress, 0, 0, Math.PI * 2); ctx.stroke()
    }
    ctx.restore()
  }

  destroy() {
    this.players.clear()
    this.knownBullets.clear()
    this.state = null
  }
}
