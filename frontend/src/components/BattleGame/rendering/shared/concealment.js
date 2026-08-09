const CELL_SIZE = 160
const CONCEALMENT_TYPES = new Set(["bush", "half", "moon_mist"])
const EMPTY_INDEX = {cells: new Map(), source: null}
const indexCache = new WeakMap()

const cellCoordinate = value => Math.floor((Number(value) || 0) / CELL_SIZE)
const cellKey = (x, y) => `${x}:${y}`
const isConcealmentWall = wall => CONCEALMENT_TYPES.has(wall?.type)

export const getConcealmentIndex = walls => {
  if (!Array.isArray(walls) || walls.length === 0) return EMPTY_INDEX
  const cached = indexCache.get(walls)
  if (cached) return cached

  const cells = new Map()
  walls.forEach(wall => {
    if (!isConcealmentWall(wall)) return
    const minX = cellCoordinate(wall.minX)
    const maxX = cellCoordinate(wall.maxX)
    const minY = cellCoordinate(wall.minY)
    const maxY = cellCoordinate(wall.maxY)
    for (let cellX = minX; cellX <= maxX; cellX += 1) {
      for (let cellY = minY; cellY <= maxY; cellY += 1) {
        const key = cellKey(cellX, cellY)
        const bucket = cells.get(key)
        if (bucket) bucket.push(wall)
        else cells.set(key, [wall])
      }
    }
  })
  const index = {cells, source: walls}
  indexCache.set(walls, index)
  return index
}

export const isInsideConcealment = (entity, sourceOrIndex = EMPTY_INDEX) => {
  if (!entity) return false
  const index = Array.isArray(sourceOrIndex) ? getConcealmentIndex(sourceOrIndex) : sourceOrIndex
  const bucket = index?.cells?.get(cellKey(cellCoordinate(entity.x), cellCoordinate(entity.y)))
  if (!bucket) return false
  return bucket.some(wall =>
    entity.x >= wall.minX && entity.x <= wall.maxX &&
    entity.y >= wall.minY && entity.y <= wall.maxY
  )
}
