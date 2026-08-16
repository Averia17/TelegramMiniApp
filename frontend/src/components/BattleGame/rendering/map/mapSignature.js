const wallSignature = wall =>
  `${wall.minX},${wall.minY},${wall.maxX},${wall.maxY},${wall.type},${wall.visual || ""}`

const featureSignature = feature =>
  `${feature.id},${feature.type},${feature.x},${feature.y},${feature.rotation || 0},${feature.scale || 1}`

export const createMapSignature = map =>
  `${map.width}:${map.height}:${(map.walls || []).map(wallSignature).join("|")}:${(map.features || []).map(featureSignature).join("|")}`
