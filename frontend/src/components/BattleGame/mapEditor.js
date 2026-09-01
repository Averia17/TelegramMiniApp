export const EDITOR_WALL_TYPES = [
  {value: "wall", label: "Камень", width: 40, depth: 40},
  {value: "destructible", label: "Разрушаемый блок", width: 40, depth: 40},
  {value: "tree", label: "Дерево", width: 40, depth: 40},
  {value: "dead_tree", label: "Сухое дерево", width: 40, depth: 40},
  {value: "crates", label: "Ящики", width: 40, depth: 40},
  {value: "barrels", label: "Бочки", width: 40, depth: 40},
  {value: "fence", label: "Забор", width: 40, depth: 40},
  {value: "bush", label: "Куст", width: 40, depth: 40},
  {value: "thorn_vine", label: "Тернии", width: 40, depth: 40},
  {value: "vine", label: "Лоза", width: 40, depth: 40},
  {value: "ruin_wall", label: "Руина", width: 40, depth: 40},
  {value: "building_wall", label: "Стена здания", width: 40, depth: 40},
  {value: "building_rubble", label: "Обломки здания", width: 40, depth: 40},
  {value: "water", label: "Вода", width: 80, depth: 80},
]

export const EDITOR_FEATURE_TYPES = [
  {value: "river_bridge", label: "Мост", scale: 1},
  {value: "pond", label: "Пруд", scale: 1},
  {value: "city_building", label: "Городское здание", scale: 1},
  {value: "city_tower", label: "Городская башня", scale: 1},
  {value: "city_shrine", label: "Городской алтарь", scale: 1},
  {value: "city_detail", label: "Городская деталь", scale: 1},
  {value: "castle_keep", label: "Замковая цитадель", scale: 1},
  {value: "castle_gate", label: "Замковые ворота", scale: 1},
  {value: "castle_house", label: "Замковый дом", scale: 1},
  {value: "castle_market", label: "Замковый рынок", scale: 1},
  {value: "castle_bastion", label: "Замковый бастион", scale: 1},
  {value: "base_well", label: "Колодец базы", scale: 1},
  {value: "base_workshop", label: "Мастерская базы", scale: 1},
  {value: "base_wagon", label: "Повозка базы", scale: 1},
]

const collectionFor = kind => kind === "feature" ? "features" : "walls"

const LINKABLE_FEATURE_TYPES = new Set([
  "city_building", "city_tower", "city_plaza", "city_street", "city_lane", "city_avenue",
  "castle_keep", "castle_gate", "castle_house", "castle_courtyard", "base_compound",
  "base_well", "base_workshop", "base_wagon", "base_barracks", "base_storehouse",
  "base_stable", "base_chapel",
])

// Existing drafts created before linkedFeatureId was added can still be opened.
// Keep the fallback deliberately tight and only consider collision-only city
// contacts, so ordinary props and neighbouring buildings never get adopted.
const FEATURE_LINK_RADIUS = Object.freeze({
  city_building: 190,
  city_tower: 80,
  city_plaza: 135,
  city_street: 125,
  city_lane: 120,
  city_avenue: 165,
  castle_keep: 250,
  castle_gate: 105,
  castle_house: 100,
  castle_courtyard: 125,
  base_compound: 250,
  base_well: 55,
  base_workshop: 75,
  base_wagon: 75,
  base_barracks: 75,
  base_storehouse: 85,
  base_stable: 85,
  base_chapel: 80,
})

const nextEditorId = (map, kind) => {
  const prefix = `${kind}-`
  const used = new Set((map[collectionFor(kind)] || []).map(item => String(item.editorId || "")))
  let index = 1
  while (used.has(`${prefix}${index}`)) index += 1
  return `${prefix}${index}`
}

export const createEditorMap = map => {
  const features = (map?.features || []).map((feature, index) => ({...feature, editorId: feature.editorId || `feature-${index + 1}`}))
  const walls = (map?.walls || []).map((wall, index) => ({...wall, editorId: wall.editorId || `wall-${index + 1}`}))
  return {
    ...map,
    walls: linkEditorCollisions(walls, features),
    features,
  }
}

const featureKey = feature => String(feature?.id || feature?.editorId || "")

const wallCenter = wall => ({
  x: (Number(wall?.minX) + Number(wall?.maxX)) / 2,
  y: (Number(wall?.minY) + Number(wall?.maxY)) / 2,
})

const distanceBetween = (first, second) => Math.hypot(first.x - second.x, first.y - second.y)

const inferLinkedFeatureId = (wall, features) => {
  if (String(wall?.type || "") !== "city_object") return ""
  const center = wallCenter(wall)
  let nearest = null
  let nearestDistance = Infinity
  for (const feature of features) {
    if (!LINKABLE_FEATURE_TYPES.has(String(feature?.type || ""))) continue
    const featurePoint = {x: Number(feature.x), y: Number(feature.y)}
    const radius = FEATURE_LINK_RADIUS[String(feature.type || "")]
    if (!Number.isFinite(featurePoint.x) || !Number.isFinite(featurePoint.y) || !Number.isFinite(radius)) continue
    const distance = distanceBetween(center, featurePoint)
    if (distance <= radius && distance < nearestDistance) {
      nearest = feature
      nearestDistance = distance
    }
  }
  return featureKey(nearest)
}

const linkEditorCollisions = (walls, features) => {
  const featureKeys = new Set(features.map(featureKey).filter(Boolean))
  return walls.map(wall => {
    const explicitLink = String(wall?.linkedFeatureId || "")
    if (explicitLink && featureKeys.has(explicitLink)) return {...wall, linkedFeatureId: explicitLink}
    if (explicitLink) {
      const linkedFeature = features.find(feature => String(feature.editorId || "") === explicitLink)
      if (linkedFeature) return {...wall, linkedFeatureId: featureKey(linkedFeature)}
    }
    const inferredLink = inferLinkedFeatureId(wall, features)
    return inferredLink ? {...wall, linkedFeatureId: inferredLink} : wall
  })
}

export const getLinkedCollisionCount = (map, feature) => {
  const key = featureKey(feature)
  if (!key) return 0
  return (map?.walls || []).filter(wall => String(wall?.linkedFeatureId || "") === key).length
}

const rotateAndScalePoint = (point, fromFeature, toFeature) => {
  const oldScale = Number(fromFeature?.scale) > 0 ? Number(fromFeature.scale) : 1
  const newScale = Number(toFeature?.scale) > 0 ? Number(toFeature.scale) : 1
  const angle = (Number(toFeature?.rotation) || 0) - (Number(fromFeature?.rotation) || 0)
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const localX = (point.x - Number(fromFeature.x || 0)) / oldScale * newScale
  const localY = (point.y - Number(fromFeature.y || 0)) / oldScale * newScale
  return {
    x: Number(toFeature.x || 0) + localX * cos - localY * sin,
    y: Number(toFeature.y || 0) + localX * sin + localY * cos,
  }
}

const transformLinkedWall = (wall, fromFeature, toFeature) => {
  const oldScale = Number(fromFeature?.scale) > 0 ? Number(fromFeature.scale) : 1
  const newScale = Number(toFeature?.scale) > 0 ? Number(toFeature.scale) : 1
  const scaleRatio = newScale / oldScale
  const angle = (Number(toFeature?.rotation) || 0) - (Number(fromFeature?.rotation) || 0)
  const center = wallCenter(wall)
  if (Number(wall?.colliderRadius) > 0) {
    const nextCenter = rotateAndScalePoint(center, fromFeature, toFeature)
    const radius = Number(wall.colliderRadius) * scaleRatio
    return {
      ...wall,
      minX: nextCenter.x - radius,
      minY: nextCenter.y - radius,
      maxX: nextCenter.x + radius,
      maxY: nextCenter.y + radius,
      rotation: (Number(wall.rotation) || 0) + angle,
      colliderRadius: radius,
      colliderInsetX: Number(wall.colliderInsetX || 0) * scaleRatio,
      colliderInsetY: Number(wall.colliderInsetY || 0) * scaleRatio,
    }
  }
  const corners = [
    {x: Number(wall.minX), y: Number(wall.minY)},
    {x: Number(wall.minX), y: Number(wall.maxY)},
    {x: Number(wall.maxX), y: Number(wall.minY)},
    {x: Number(wall.maxX), y: Number(wall.maxY)},
  ].map(point => rotateAndScalePoint(point, fromFeature, toFeature))
  return {
    ...wall,
    minX: Math.min(...corners.map(point => point.x)),
    minY: Math.min(...corners.map(point => point.y)),
    maxX: Math.max(...corners.map(point => point.x)),
    maxY: Math.max(...corners.map(point => point.y)),
    rotation: (Number(wall.rotation) || 0) + angle,
    colliderInsetX: Number(wall.colliderInsetX || 0) * scaleRatio,
    colliderInsetY: Number(wall.colliderInsetY || 0) * scaleRatio,
  }
}

const featureChangedTransform = (fromFeature, toFeature) => ["x", "y", "rotation", "scale"].some(key => {
  const from = Number(fromFeature?.[key] || 0)
  const to = Number(toFeature?.[key] || 0)
  return from !== to
})

const transformFeatureCollisions = (walls, fromFeature, toFeature) => {
  if (!featureChangedTransform(fromFeature, toFeature)) return walls
  const key = featureKey(fromFeature)
  if (!key) return walls
  return walls.map(wall => String(wall?.linkedFeatureId || "") === key ? transformLinkedWall(wall, fromFeature, toFeature) : wall)
}

export const listEditorItems = map => [
  ...(map?.walls || []).map((wall, index) => ({
    kind: "wall",
    editorId: wall.editorId || `wall-${index + 1}`,
    type: wall.type,
    item: wall,
  })),
  ...(map?.features || []).map((feature, index) => ({
    kind: "feature",
    editorId: feature.editorId || `feature-${index + 1}`,
    type: feature.type,
    item: feature,
  })),
]

const numericBounds = item => {
  const minX = Number(item?.minX)
  const minY = Number(item?.minY)
  const maxX = Number(item?.maxX)
  const maxY = Number(item?.maxY)
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null
  return {
    minX: Math.min(minX, maxX),
    minY: Math.min(minY, maxY),
    maxX: Math.max(minX, maxX),
    maxY: Math.max(minY, maxY),
  }
}

const expandBounds = (bounds, other) => {
  if (!other) return bounds
  return {
    minX: Math.min(bounds.minX, other.minX),
    minY: Math.min(bounds.minY, other.minY),
    maxX: Math.max(bounds.maxX, other.maxX),
    maxY: Math.max(bounds.maxY, other.maxY),
  }
}

export const getEditorItemBounds = (map, descriptor) => {
  if (!descriptor?.item) return null
  if (descriptor.kind === "wall") return numericBounds(descriptor.item)

  const feature = descriptor.item
  const tileSize = Number(map?.tileSize) > 0 ? Number(map.tileSize) : 40
  const featureSize = tileSize * 2.4 * (Number(feature.scale) > 0 ? Number(feature.scale) : 1)
  const centerX = Number(feature.x)
  const centerY = Number(feature.y)
  if (![centerX, centerY].every(Number.isFinite)) return null
  let bounds = {
    minX: centerX - featureSize / 2,
    minY: centerY - featureSize / 2,
    maxX: centerX + featureSize / 2,
    maxY: centerY + featureSize / 2,
  }
  const key = featureKey(feature)
  if (!key) return bounds
  for (const wall of map?.walls || []) {
    if (String(wall?.linkedFeatureId || "") !== key) continue
    bounds = expandBounds(bounds, numericBounds(wall))
  }
  return bounds
}

export const isEditorItemHit = (map, descriptor, point) => {
  const bounds = getEditorItemBounds(map, descriptor)
  if (!bounds || !Number.isFinite(Number(point?.x)) || !Number.isFinite(Number(point?.y))) return false
  const item = descriptor.item
  const rotation = descriptor.kind === "wall" && Number.isFinite(Number(item.rotation)) ? Number(item.rotation) : 0
  const centerX = (bounds.minX + bounds.maxX) / 2
  const centerY = (bounds.minY + bounds.maxY) / 2
  const dx = Number(point.x) - centerX
  const dy = Number(point.y) - centerY
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const localX = dx * cos + dy * sin
  const localY = -dx * sin + dy * cos
  const padding = descriptor.kind === "wall" ? Math.max(3, Number(map?.tileSize || 40) * .12) : Math.max(6, Number(map?.tileSize || 40) * .16)
  return Math.abs(localX) <= (bounds.maxX - bounds.minX) / 2 + padding &&
    Math.abs(localY) <= (bounds.maxY - bounds.minY) / 2 + padding
}

export const appendEditorItem = (map, input) => {
  const kind = input.kind === "feature" ? "feature" : "wall"
  const collection = collectionFor(kind)
  const editorId = input.editorId || nextEditorId(map, kind)
  const x = Number(input.x) || 0
  const y = Number(input.y) || 0
  const width = Math.max(2, Number(input.width) || Number(input.depth) || 40)
  const depth = Math.max(2, Number(input.depth) || width)
  const item = kind === "feature"
    ? {
      id: input.id || `editor-${editorId}`,
      type: input.type,
      x,
      y,
      scale: Number(input.scale) > 0 ? Number(input.scale) : 1,
      rotation: Number.isFinite(Number(input.rotation)) ? Number(input.rotation) : 0,
      editorRotation: true,
      editorId,
    }
    : {
      minX: x - width / 2,
      minY: y - depth / 2,
      maxX: x + width / 2,
      maxY: y + depth / 2,
      type: input.type,
      rotation: Number.isFinite(Number(input.rotation)) ? Number(input.rotation) : 0,
      editorId,
    }
  return {...map, [collection]: [...(map[collection] || []), item]}
}

export const updateEditorItem = (map, selection, patch) => {
  if (!selection?.editorId) return map
  const collection = collectionFor(selection.kind)
  const items = map?.[collection] || []
  if (!items.some(item => String(item.editorId) === String(selection.editorId))) return map
  const nextItems = items.map(item => String(item.editorId) === String(selection.editorId) ? {...item, ...patch} : item)
  if (selection.kind !== "feature") return {
    ...map,
    [collection]: nextItems,
  }
  const currentFeature = items.find(item => String(item.editorId) === String(selection.editorId))
  const nextFeature = nextItems.find(item => String(item.editorId) === String(selection.editorId))
  return {
    ...map,
    [collection]: nextItems,
    walls: transformFeatureCollisions(map.walls || [], currentFeature, nextFeature),
  }
}

export const removeEditorItem = (map, selection) => {
  if (!selection?.editorId) return map
  const collection = collectionFor(selection.kind)
  const removed = {
    ...map,
    [collection]: (map?.[collection] || []).filter(item => String(item.editorId) !== String(selection.editorId)),
  }
  if (selection.kind !== "feature") return removed
  const feature = (map?.features || []).find(item => String(item.editorId) === String(selection.editorId))
  const key = featureKey(feature)
  return {
    ...removed,
    walls: (map?.walls || []).filter(wall => String(wall?.linkedFeatureId || "") !== key),
  }
}

export const duplicateEditorItem = (map, selection, position = {}) => {
  const descriptor = listEditorItems(map).find(item => item.kind === selection?.kind && String(item.editorId) === String(selection?.editorId))
  if (!descriptor) return map
  const source = descriptor.item
  const center = descriptor.kind === "feature" ? {x: Number(source.x) || 0, y: Number(source.y) || 0} : wallCenter(source)
  const nextPosition = {
    x: Number.isFinite(Number(position.x)) ? Number(position.x) : center.x,
    y: Number.isFinite(Number(position.y)) ? Number(position.y) : center.y,
  }
  if (descriptor.kind === "wall") {
    return appendEditorItem(map, {
      kind: "wall",
      type: source.type,
      x: nextPosition.x,
      y: nextPosition.y,
      width: Math.max(2, Number(source.maxX) - Number(source.minX)),
      depth: Math.max(2, Number(source.maxY) - Number(source.minY)),
      rotation: source.rotation,
    })
  }

  const editorId = nextEditorId(map, "feature")
  const featureId = `${source.id || "feature"}-${editorId}`
  const duplicatedFeature = {
    ...source,
    id: featureId,
    x: nextPosition.x,
    y: nextPosition.y,
    editorId,
  }
  const sourceKey = featureKey(source)
  const usedWallIds = new Set((map.walls || []).map(wall => String(wall.editorId || "")))
  const nextWallEditorId = () => {
    let index = 1
    while (usedWallIds.has(`wall-${index}`)) index += 1
    const id = `wall-${index}`
    usedWallIds.add(id)
    return id
  }
  const duplicatedWalls = (map?.walls || [])
    .filter(wall => String(wall?.linkedFeatureId || "") === sourceKey)
    .map(wall => ({
      ...transformLinkedWall(wall, source, duplicatedFeature),
      linkedFeatureId: featureId,
      editorId: nextWallEditorId(),
    }))
  return {
    ...map,
    features: [...(map.features || []), duplicatedFeature],
    walls: [...(map.walls || []), ...duplicatedWalls],
  }
}

export const createEditorHistory = (initial, limit = 100) => ({
  past: [],
  present: initial,
  future: [],
  limit: Math.max(1, Number(limit) || 100),
})

export const recordEditorHistory = (history, next) => {
  if (!history || next === history.present) return history
  return {
    ...history,
    past: [...history.past, history.present].slice(-history.limit),
    present: next,
    future: [],
  }
}

export const undoEditorHistory = history => {
  if (!history?.past?.length) return history
  const previous = history.past[history.past.length - 1]
  return {
    ...history,
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  }
}

export const redoEditorHistory = history => {
  if (!history?.future?.length) return history
  const next = history.future[0]
  return {
    ...history,
    past: [...history.past, history.present].slice(-history.limit),
    present: next,
    future: history.future.slice(1),
  }
}

const cleanItem = item => {
  const result = {...item}
  delete result.editorId
  return result
}

export const exportEditorMap = map => JSON.stringify({
  ...map,
  walls: (map?.walls || []).map(cleanItem),
  features: (map?.features || []).map(cleanItem),
}, null, 2)
