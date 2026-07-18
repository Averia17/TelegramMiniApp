export const TILE = Object.freeze({EMPTY: 0, BUSH: 1, DESTRUCTIBLE: 2, SOLID: 3, WATER: 4, CRATE: 5, SPAWN: 6})
const TYPE = {1: "bush", 2: "destructible", 3: "wall", 4: "water", 5: "crates"}
const clamp = (v, min, max) => Math.max(min, Math.min(max, v))
const rng = seed => { let s = seed >>> 0; return () => ((s = Math.imul(s ^ s >>> 15, 1 | s) + 0x6d2b79f5 | 0), ((s ^ s >>> 14) >>> 0) / 4294967296) }
const fade = t => t * t * t * (t * (t * 6 - 15) + 10)
const lerp = (a, b, t) => a + (b - a) * t

const makeNoise = seed => {
  const random = rng(seed), gradients = new Map()
  const gradient = (x, y) => {
    const key = `${x}:${y}`
    if (!gradients.has(key)) { const a = random() * Math.PI * 2; gradients.set(key, [Math.cos(a), Math.sin(a)]) }
    return gradients.get(key)
  }
  return (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), sx = fade(x - x0), sy = fade(y - y0)
    const dot = (gx, gy) => { const g = gradient(gx, gy); return g[0] * (x - gx) + g[1] * (y - gy) }
    return lerp(lerp(dot(x0, y0), dot(x0 + 1, y0), sx), lerp(dot(x0, y0 + 1), dot(x0 + 1, y0 + 1), sx), sy)
  }
}

const clearDisk = (grid, cx, cy, radius) => {
  for (let y = cy - radius; y <= cy + radius; y += 1) for (let x = cx - radius; x <= cx + radius; x += 1)
    if (grid[y]?.[x] !== undefined && Math.hypot(x - cx, y - cy) <= radius) grid[y][x] = TILE.EMPTY
}

const floodRepair = grid => {
  const h = grid.length, w = grid[0].length, passable = v => v !== TILE.SOLID && v !== TILE.WATER
  const seen = new Set(), queue = [[Math.floor(w / 2), Math.floor(h / 2)]]
  while (queue.length) {
    const [x, y] = queue.shift(), key = y * w + x
    if (seen.has(key) || !grid[y] || grid[y][x] === undefined || !passable(grid[y][x])) continue
    seen.add(key); queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1])
  }
  // Carve isolated pockets toward the center; this guarantees one walkable component.
  for (let y = 1; y < h - 1; y += 1) for (let x = 1; x < w - 1; x += 1) if (passable(grid[y][x]) && !seen.has(y * w + x)) {
    let cx = x, cy = y, guard = w + h
    while (!seen.has(cy * w + cx) && guard-- > 0) {
      grid[cy][cx] = TILE.EMPTY
      if (Math.abs(cx - w / 2) > Math.abs(cy - h / 2)) cx += Math.sign(w / 2 - cx); else cy += Math.sign(h / 2 - cy)
    }
  }
}

const toWalls = (grid, tileSize) => grid.flatMap((row, y) => row.flatMap((tile, x) => TYPE[tile] ? [{tileX: x, tileY: y, minX: x * tileSize, minY: y * tileSize, maxX: (x + 1) * tileSize, maxY: (y + 1) * tileSize, type: TYPE[tile]}] : []))

const labelBushes = walls => {
  const byCell = new Map(walls.filter(w => w.type === "bush").map(w => [`${w.tileX}:${w.tileY}`, w]))
  let group = 0
  byCell.forEach(start => {
    if (start.bushGroup !== undefined) return
    const queue = [start]; start.bushGroup = group
    while (queue.length) {
      const tile = queue.shift()
      ;[[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
        const next = byCell.get(`${tile.tileX + dx}:${tile.tileY + dy}`)
        if (next && next.bushGroup === undefined) { next.bushGroup = group; queue.push(next) }
      })
    }
    group += 1
  })
}

export const generateBattleRoyaleMap = ({size = 60, tileSize = 40, seed = Date.now()} = {}) => {
  const grid = Array.from({length: size}, () => Array(size).fill(TILE.EMPTY))
  const noise = makeNoise(seed), random = rng(seed ^ 0x9e3779b9), half = Math.ceil(size / 2)
  for (let y = 0; y < half; y += 1) for (let x = 0; x < half; x += 1) {
    const edge = Math.min(x, y), n = noise(x / 6.5, y / 6.5) + noise(x / 14, y / 14) * .45
    grid[y][x] = edge > 2 && n > .22 ? (random() < .68 ? TILE.DESTRUCTIBLE : TILE.SOLID) : edge > 1 && n > -.04 ? TILE.BUSH : edge > 3 && n < -.43 ? TILE.WATER : TILE.EMPTY
    const value = grid[y][x]
    grid[y][size - 1 - x] = value; grid[size - 1 - y][x] = value; grid[size - 1 - y][size - 1 - x] = value
  }
  const center = Math.floor(size / 2); clearDisk(grid, center, center, 4)
  // One randomized point per angular sector: varied between matches, but never clustered.
  const spawnCount = 8
  const angleOffset = random() * Math.PI * 2
  const spawns = Array.from({length: spawnCount}, (_, i) => {
    const sector = Math.PI * 2 / spawnCount
    const angle = angleOffset + i * sector + (random() - .5) * sector * .48
    const radius = size * (.35 + random() * .08)
    const x = clamp(Math.round(center + Math.cos(angle) * radius), 3, size - 4)
    const y = clamp(Math.round(center + Math.sin(angle) * radius), 3, size - 4)
    clearDisk(grid, x, y, 2); grid[y][x] = TILE.SPAWN
    return {x: (x + .5) * tileSize, y: (y + .5) * tileSize, tileX: x, tileY: y}
  })
  floodRepair(grid)
  const placeCrates = (count, central) => { let placed = 0, attempts = 0; while (placed < count && attempts++ < 2000) { const a = random() * Math.PI * 2, r = central ? Math.sqrt(random()) * size * .18 : size * (.24 + random() * .18), x = clamp(Math.round(center + Math.cos(a) * r), 2, size - 3), y = clamp(Math.round(center + Math.sin(a) * r), 2, size - 3); if (grid[y][x] === TILE.EMPTY) { grid[y][x] = TILE.CRATE; placed += 1 } } }
  placeCrates(12, true); placeCrates(18, false)
  const map = {width: size * tileSize, height: size * tileSize, tileSize, grid, spawns, navRevision: 0}
  map.walls = toWalls(grid, tileSize)
  labelBushes(map.walls)
  map.destroyTile = (x, y) => { if (map.grid[y]?.[x] !== TILE.DESTRUCTIBLE) return false; map.grid[y][x] = TILE.EMPTY; map.walls = map.walls.filter(w => w.tileX !== x || w.tileY !== y); map.navRevision += 1; return true }
  return map
}
