const TAU = Math.PI * 2
const OCTANT = TAU / 8

export const normalizeAngle = angle => Math.atan2(Math.sin(angle || 0), Math.cos(angle || 0))

// Direction rows are ordered N, NE, E, SE, S, SW, W, NW. Adding half an
// octant makes the nearest direction win, including across the -PI/PI seam.
export const angleToDirectionIndex = angle =>
  Math.floor(((normalizeAngle(angle) + Math.PI / 2 + TAU + OCTANT / 2) % TAU) / OCTANT) % 8

// Returning both neighbours allows the renderer to cross-fade during a turn
// instead of snapping an entire silhouette at an octant boundary.
export const getDirectionBlend = angle => {
  const direction = ((normalizeAngle(angle) + Math.PI / 2 + TAU) % TAU) / OCTANT
  const from = Math.floor(direction) % 8
  return {from, to: (from + 1) % 8, mix: direction - Math.floor(direction)}
}

const cache = new Map()

export const getSpriteImage = source => {
  if (!source || typeof Image === "undefined") return null
  if (!cache.has(source)) {
    const image = new Image()
    image.decoding = "async"
    image.src = source
    cache.set(source, image)
  }
  const image = cache.get(source)
  return image.complete && image.naturalWidth > 0 ? image : null
}

export const drawDirectionalFrame = (ctx, image, atlas, animation, direction, frame, alpha = 1) => {
  const clip = atlas.animations[animation] || atlas.animations.idle
  if (!image || !clip) return false
  const frameCount = Math.max(1, clip.frames)
  const safeFrame = ((Math.floor(frame) % frameCount) + frameCount) % frameCount
  const columns = atlas.directionAxis === "columns" ? 8 : Math.max(...Object.values(atlas.animations).map(item => item.start + item.frames))
  const rows = atlas.directionAxis === "columns" ? Math.max(...Object.values(atlas.animations).map(item => item.row + 1)) : 8
  const cellWidth = image.naturalWidth / columns
  const cellHeight = image.naturalHeight / rows
  const sourceDirection = atlas.directionMap?.[direction] ?? direction
  const sx = atlas.directionAxis === "columns" ? sourceDirection * cellWidth : (clip.start + safeFrame) * cellWidth
  const sy = atlas.directionAxis === "columns" ? clip.row * cellHeight : sourceDirection * cellHeight
  const previousAlpha = ctx.globalAlpha
  ctx.globalAlpha = previousAlpha * alpha
  ctx.drawImage(image, sx, sy, cellWidth, cellHeight, -atlas.anchorX, -atlas.anchorY, atlas.width, atlas.height)
  ctx.globalAlpha = previousAlpha
  return true
}
