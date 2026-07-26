const wallSignature = wall =>
  `${wall.minX},${wall.minY},${wall.maxX},${wall.maxY},${wall.type},${wall.visual || ""}`

export const createMapSignature = map =>
  `${map.width}:${map.height}:${(map.walls || []).map(wallSignature).join("|")}`
