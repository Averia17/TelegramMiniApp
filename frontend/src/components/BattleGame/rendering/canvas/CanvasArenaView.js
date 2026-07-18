import {DEPTH} from "../config"

const seededRandom = seed => {
  let value = seed
  return () => {
    value = value * 16807 % 2147483647
    return (value - 1) / 2147483646
  }
}

const roundedRect = (ctx, x, y, width, height, radius) => {
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, radius)
}

export class CanvasArenaView {
  constructor() {
    this.map = {width: 1024, height: 768, tileSize: 32, walls: []}
    this.visualWalls = []
    this.decor = []
    this.signature = ""
    this.localPlayer = null
    this.enemies = []
    this.time = 0
    this.rebuildDecor()
  }

  setVisibilityContext(localPlayer, enemies = []) {
    this.localPlayer = localPlayer || null
    this.enemies = enemies
  }

  setMap(map) {
    if (!map) return
    const walls = Array.isArray(map.walls) ? map.walls : this.map.walls
    this.map = {...this.map, ...map, walls}
    if (Array.isArray(map.walls)) this.visualWalls = this.mergeWalls(map.walls)
    const signature = `${this.map.width}:${this.map.height}`
    if (signature !== this.signature) {
      this.signature = signature
      this.rebuildDecor()
    }
  }

  rebuildDecor() {
    const random = seededRandom(1337)
    const count = Math.min(260, Math.max(80, Math.round(this.map.width * this.map.height / 18000)))
    this.decor = Array.from({length: count}, (_, index) => ({
      x: 18 + random() * Math.max(20, this.map.width - 36),
      y: 18 + random() * Math.max(20, this.map.height * DEPTH - 36),
      size: 1.5 + random() * 3.5,
      kind: index % 9,
      rotation: random() * Math.PI,
    }))
  }

  mergeWalls(walls) {
    const sorted = [...walls].sort((a, b) => a.minY - b.minY || a.maxY - b.maxY || a.minX - b.minX)
    return sorted.reduce((merged, wall) => {
      const previous = merged[merged.length - 1]
      const sameRow = previous && previous.minY === wall.minY && previous.maxY === wall.maxY
      if (sameRow && previous.type === wall.type && Math.abs(previous.maxX - wall.minX) < 0.01) {
        previous.maxX = wall.maxX
      } else {
        merged.push({...wall})
      }
      return merged
    }, [])
  }

  drawGround(ctx) {
    const height = this.map.height * DEPTH
    const sand = ctx.createLinearGradient(0, 0, 0, height)
    sand.addColorStop(0, "#f5b06e")
    sand.addColorStop(0.55, "#ee9862")
    sand.addColorStop(1, "#db794f")
    ctx.fillStyle = sand
    ctx.fillRect(0, 0, this.map.width, height)

    // Broad painted terrain bands replace the prototype checkerboard.
    ctx.strokeStyle = "rgba(255,205,139,.27)"
    ctx.lineWidth = 90
    ctx.beginPath(); ctx.moveTo(-80, height * .34); ctx.bezierCurveTo(this.map.width * .22, height * .2, this.map.width * .58, height * .52, this.map.width + 80, height * .31); ctx.stroke()
    ctx.strokeStyle = "rgba(177,78,62,.13)"; ctx.lineWidth = 5
    ctx.beginPath(); ctx.moveTo(-40, height * .37); ctx.bezierCurveTo(this.map.width * .25, height * .23, this.map.width * .55, height * .56, this.map.width + 40, height * .34); ctx.stroke()

    this.decor.forEach(detail => {
      if (detail.kind <= 1) {
        ctx.fillStyle = "rgba(117,74,41,.27)"
        ctx.beginPath()
        ctx.ellipse(detail.x, detail.y, detail.size * 1.8, detail.size * 0.7, 0, 0, Math.PI * 2)
        ctx.fill()
      } else if (detail.kind <= 4) {
        ctx.save(); ctx.translate(detail.x, detail.y); ctx.rotate(detail.rotation)
        ctx.fillStyle = detail.kind === 2 ? "#cb5d4d" : "#e17655"
        ctx.beginPath(); ctx.moveTo(-detail.size * 2, 0); ctx.lineTo(-detail.size * .2, -detail.size); ctx.lineTo(detail.size * 2, -.3); ctx.lineTo(detail.size, detail.size); ctx.closePath(); ctx.fill(); ctx.restore()
      } else {
        ctx.strokeStyle = detail.kind % 2 ? "rgba(183,123,63,.35)" : "rgba(255,225,159,.38)"
        ctx.lineWidth = 1.3
        ctx.beginPath()
        ctx.moveTo(detail.x - detail.size, detail.y + detail.size * 0.35)
        ctx.lineTo(detail.x + detail.size, detail.y - detail.size * 0.3)
        ctx.stroke()
      }
    })

    ctx.strokeStyle = "rgba(147,86,44,.72)"
    ctx.lineWidth = 6
    roundedRect(ctx, 4, 4, this.map.width - 8, height - 8, 18)
    ctx.stroke()
  }

  getDepthItems() {
    return this.visualWalls.map((wall, index) => ({
      depth: wall.maxY * DEPTH,
      draw: ctx => this.drawObstacle(ctx, wall, index),
    }))
  }

  drawObstacle(ctx, wall, index) {
    const x = wall.minX
    const y = wall.minY * DEPTH
    const width = Math.max(4, wall.maxX - wall.minX)
    const footprint = Math.max(4, (wall.maxY - wall.minY) * DEPTH)
    const bush = wall.type === "half" || wall.type === "bush"

    if (bush && wall.bushGroup !== undefined) {
      const group = this.map.walls.filter(item => item.bushGroup === wall.bushGroup)
      const inside = entity => entity && group.some(item => entity.x >= item.minX && entity.x <= item.maxX && entity.y >= item.minY && entity.y <= item.maxY)
      if (inside(this.localPlayer)) { ctx.save(); ctx.globalAlpha = .4; this.drawBush(ctx, wall, index, x, y, width, footprint); ctx.restore(); return }
    }

    if (wall.type === "water") {
      ctx.fillStyle = "rgba(130,67,58,.38)"; roundedRect(ctx, x - 7, y - 5, width + 14, Math.max(28, footprint + 12), 16); ctx.fill()
      const gradient = ctx.createLinearGradient(x, y, x, y + footprint)
      gradient.addColorStop(0, "#43c9ed"); gradient.addColorStop(1, "#1688cf")
      ctx.fillStyle = gradient; roundedRect(ctx, x, y, width, Math.max(18, footprint), 12); ctx.fill()
      ctx.strokeStyle = "rgba(255,255,255,.65)"; ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(x + 12, y + 8); ctx.lineTo(x + width - 12, y + 8); ctx.stroke()
      for (let wave = 22; wave < width; wave += 54) { const drift = Math.sin(this.time * 2.2 + wave * .08) * 5; ctx.beginPath(); ctx.arc(x + wave + drift, y + footprint * .62, 12, .15, Math.PI - .15); ctx.stroke() }
      return
    }

    if (wall.type === "fence") {
      const posts = Math.max(2, Math.ceil(width / 24))
      ctx.fillStyle = "rgba(66,42,35,.28)"; roundedRect(ctx, x + 5, y + 2, width + 8, 9, 4); ctx.fill()
      ctx.strokeStyle = "#71432f"; ctx.lineCap = "round"
      ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(x + 4, y - 18); ctx.lineTo(x + width - 4, y - 18); ctx.moveTo(x + 4, y - 3); ctx.lineTo(x + width - 4, y - 3); ctx.stroke()
      for (let post = 0; post < posts; post += 1) {
        const px = x + post / (posts - 1) * width
        ctx.fillStyle = post % 2 ? "#a66a3d" : "#bd7a45"
        ctx.beginPath(); ctx.moveTo(px - 6, y + 3); ctx.lineTo(px - 5, y - 31); ctx.lineTo(px, y - 38); ctx.lineTo(px + 6, y - 31); ctx.lineTo(px + 6, y + 3); ctx.closePath(); ctx.fill()
        ctx.strokeStyle = "#623b2e"; ctx.lineWidth = 2; ctx.stroke()
      }
      return
    }

    if (["crates", "barrels", "cactus", "crystal", "bones"].includes(wall.type)) {
      const count = Math.max(1, Math.floor(width / 42))
      for (let item = 0; item < count; item += 1) {
        const px = x + (item + .5) / count * width
        if (wall.type === "crates") {
          roundedRect(ctx, px - 20, y - 35, 40, 40, 5); ctx.fillStyle = "#c47a32"; ctx.fill(); ctx.strokeStyle = "#70422d"; ctx.lineWidth = 4; ctx.stroke()
          ctx.beginPath(); ctx.moveTo(px - 15, y - 30); ctx.lineTo(px + 15, y); ctx.moveTo(px + 15, y - 30); ctx.lineTo(px - 15, y); ctx.stroke()
        } else if (wall.type === "barrels") {
          ctx.fillStyle = "#a94a3b"; ctx.beginPath(); ctx.ellipse(px, y - 15, 18, 25, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = "#682f38"; ctx.lineWidth = 5; ctx.stroke()
          ctx.strokeStyle = "#e9a04b"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(px - 17, y - 23); ctx.lineTo(px + 17, y - 23); ctx.moveTo(px - 17, y - 7); ctx.lineTo(px + 17, y - 7); ctx.stroke()
        } else if (wall.type === "cactus") {
          ctx.strokeStyle = "#176340"; ctx.lineWidth = 22; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y - 52); ctx.moveTo(px, y - 30); ctx.lineTo(px - 16, y - 41); ctx.moveTo(px, y - 21); ctx.lineTo(px + 17, y - 34); ctx.stroke()
          ctx.strokeStyle = "#47b85a"; ctx.lineWidth = 12; ctx.stroke()
          ctx.fillStyle = "#ff5d70"; ctx.beginPath(); ctx.arc(px, y - 60, 7, 0, Math.PI * 2); ctx.fill()
          ctx.fillStyle = "#ffd34c"; ctx.beginPath(); ctx.arc(px, y - 60, 3, 0, Math.PI * 2); ctx.fill()
        } else if (wall.type === "crystal") {
          ctx.fillStyle = item % 2 ? "#7c4be2" : "#58d9f0"; ctx.beginPath(); ctx.moveTo(px, y - 58); ctx.lineTo(px + 19, y - 19); ctx.lineTo(px + 10, y + 3); ctx.lineTo(px - 15, y); ctx.lineTo(px - 20, y - 22); ctx.closePath(); ctx.fill()
          ctx.fillStyle = "rgba(255,255,255,.38)"; ctx.beginPath(); ctx.moveTo(px - 4, y - 49); ctx.lineTo(px + 5, y - 20); ctx.lineTo(px - 8, y - 13); ctx.closePath(); ctx.fill()
        } else {
          ctx.strokeStyle = "#f4e4bf"; ctx.lineWidth = 9; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(px - 16, y - 20); ctx.lineTo(px + 16, y); ctx.moveTo(px + 16, y - 20); ctx.lineTo(px - 16, y); ctx.stroke()
          ctx.fillStyle = "#f4e4bf"; [-18,18].forEach(dx => { ctx.beginPath(); ctx.arc(px + dx, y - 10, 6, 0, Math.PI * 2); ctx.fill() })
        }
      }
      return
    }

    if (bush) {
      this.drawBush(ctx, wall, index, x, y, width, footprint)
      return
    }

    // The visible face is nearly one world tile high, matching the chunky
    // top/face proportion used by Brawl-style arena blocks.
    const tile = this.map.tileSize || 40
    const height = Math.min(52, Math.max(32, tile * .88))
    const top = index % 5 === 0 ? "#e89755" : "#f0ad5f"
    const front = index % 5 === 0 ? "#a9493f" : "#bd5a42"
    const side = index % 5 === 0 ? "#843744" : "#954039"
    const line = index % 5 === 0 ? "#74303b" : "#823738"
    const topY = y - height

    const shadow = ctx.createLinearGradient(x, 0, x + width + 22, 0)
    shadow.addColorStop(0, "rgba(60,35,37,.34)")
    shadow.addColorStop(1, "rgba(60,35,37,0)")
    ctx.fillStyle = shadow
    roundedRect(ctx, x + 7, y + footprint + 5, width + 22, 11, 6)
    ctx.fill()

    const frontGradient = ctx.createLinearGradient(0, topY + footprint, 0, y + footprint + height)
    frontGradient.addColorStop(0, front)
    frontGradient.addColorStop(1, side)
    ctx.fillStyle = frontGradient
    roundedRect(ctx, x, topY + footprint - 2, width, height + 6, 5)
    ctx.fill()
    ctx.fillStyle = side
    ctx.beginPath()
    ctx.moveTo(x + width, topY + 4)
    ctx.lineTo(x + width + 6, topY)
    ctx.lineTo(x + width + 6, y + footprint + 1)
    ctx.lineTo(x + width, y + footprint + 3)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = top
    roundedRect(ctx, x, topY, width, footprint, Math.min(8, width / 4, footprint / 3))
    ctx.fill()
    ctx.fillStyle = "rgba(255,222,145,.22)"
    roundedRect(ctx, x + 3, topY + 3, Math.max(0, width - 6), Math.max(0, footprint * 0.34), 4)
    ctx.fill()
    ctx.strokeStyle = line
    ctx.lineWidth = 2
    roundedRect(ctx, x, topY, width, footprint, Math.min(8, width / 4, footprint / 3))
    ctx.stroke()
    ctx.strokeStyle = "rgba(255,255,255,.22)"
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x + 4, topY + 4)
    ctx.lineTo(x + width - 4, topY + 4)
    ctx.stroke()
    ctx.strokeStyle = "rgba(101,43,43,.42)"; ctx.lineWidth = 2
    for (let crack = 18; crack < width; crack += 58) {
      ctx.beginPath(); ctx.moveTo(x + crack, topY + 8); ctx.lineTo(x + crack + 7, topY + 13); ctx.lineTo(x + crack + 3, topY + 19); ctx.stroke()
    }
    ctx.strokeStyle = "rgba(116,48,59,.32)"
    for (let moduleX = 32; moduleX < width; moduleX += 32) {
      ctx.beginPath()
      ctx.moveTo(x + moduleX, topY + 3)
      ctx.lineTo(x + moduleX, topY + footprint - 3)
      ctx.stroke()
    }
  }

  drawBush(ctx, wall, index, x, y, width, footprint) {
    ctx.fillStyle = "rgba(51,45,29,.22)"
    ctx.beginPath()
    ctx.ellipse(x + width / 2 + 3, y + footprint / 2 + 6, width / 2 + 7, footprint / 2 + 7, 0, 0, Math.PI * 2)
    ctx.fill()
    const count = Math.max(5, Math.ceil(width / 13))
    for (let leaf = 0; leaf < count; leaf += 1) {
      const px = x + (leaf + .5) / count * width
      const py = y + footprint * (.35 + leaf % 2 * .25)
      const blade = 18 + leaf % 3 * 5
      ctx.fillStyle = ["#55a936", "#6fc142", "#45952f", "#82ce4b"][(index + leaf) % 4]
      ctx.beginPath(); ctx.moveTo(px - 8, py + 5); ctx.quadraticCurveTo(px - 10, py - blade * .65, px - 3, py - blade); ctx.quadraticCurveTo(px + 1, py - blade * .45, px, py + 5); ctx.fill()
      ctx.beginPath(); ctx.moveTo(px, py + 5); ctx.quadraticCurveTo(px + 9, py - blade * .55, px + 8, py - blade * .82); ctx.quadraticCurveTo(px + 15, py - blade * .35, px + 10, py + 5); ctx.fill()
    }
  }
}
