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
    this.rebuildDecor()
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
    sand.addColorStop(0, "#f6cf72")
    sand.addColorStop(0.55, "#e9b957")
    sand.addColorStop(1, "#d99a45")
    ctx.fillStyle = sand
    ctx.fillRect(0, 0, this.map.width, height)

    const tile = 64
    ctx.fillStyle = "rgba(255,238,173,.14)"
    for (let y = 0; y < this.map.height; y += tile) {
      for (let x = 0; x < this.map.width; x += tile) {
        if ((x / tile + y / tile) % 2 === 0) ctx.fillRect(x, y * DEPTH, tile, tile * DEPTH)
      }
    }

    this.decor.forEach(detail => {
      if (detail.kind === 0) {
        ctx.fillStyle = "rgba(117,74,41,.27)"
        ctx.beginPath()
        ctx.ellipse(detail.x, detail.y, detail.size * 1.8, detail.size * 0.7, 0, 0, Math.PI * 2)
        ctx.fill()
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

    if (bush) {
      ctx.fillStyle = "rgba(51,45,29,.22)"
      ctx.beginPath()
      ctx.ellipse(x + width / 2 + 3, y + footprint / 2 + 6, width / 2 + 7, footprint / 2 + 7, 0, 0, Math.PI * 2)
      ctx.fill()
      const count = Math.max(3, Math.ceil(width / 18))
      for (let leaf = 0; leaf < count; leaf += 1) {
        const px = x + (leaf + 0.5) / count * width
        const py = y + footprint * (0.35 + leaf % 2 * 0.25)
        ctx.fillStyle = ["#26753d", "#318c43", "#49a94c", "#62bd50"][(index + leaf) % 4]
        ctx.beginPath()
        ctx.ellipse(px, py - 5, 14, 12, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = "rgba(189,240,113,.38)"
        ctx.beginPath()
        ctx.ellipse(px - 5, py - 10, 5, 3, -.3, 0, Math.PI * 2)
        ctx.fill()
      }
      return
    }

    const height = Math.min(42, Math.max(26, 22 + footprint * 0.2))
    const top = index % 5 === 0 ? "#e89755" : "#f0ad5f"
    const front = index % 5 === 0 ? "#a9493f" : "#bd5a42"
    const side = index % 5 === 0 ? "#843744" : "#954039"
    const line = index % 5 === 0 ? "#74303b" : "#823738"
    const topY = y - height

    ctx.fillStyle = "rgba(74,45,40,.3)"
    roundedRect(ctx, x + 5, y + footprint + 4, width + 10, 8, 5)
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
    ctx.strokeStyle = "rgba(116,48,59,.32)"
    for (let moduleX = 32; moduleX < width; moduleX += 32) {
      ctx.beginPath()
      ctx.moveTo(x + moduleX, topY + 3)
      ctx.lineTo(x + moduleX, topY + footprint - 3)
      ctx.stroke()
    }
  }
}
