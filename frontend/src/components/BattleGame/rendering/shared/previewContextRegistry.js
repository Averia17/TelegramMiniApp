const previewRenderers = new Set()
let activePreviewSlots = 0
const previewSlotQueue = []

const createSlotRelease = () => {
  let released = false
  return () => {
    if (released) return
    released = true
    activePreviewSlots--
    const next = previewSlotQueue.shift()
    if (next) {
      activePreviewSlots++
      next(createSlotRelease())
    }
  }
}

export const acquirePreviewSlot = (limit = 1) => {
  if (activePreviewSlots < limit) {
    activePreviewSlots++
    return Promise.resolve(createSlotRelease())
  }
  return new Promise(resolve => previewSlotQueue.push(resolve))
}

export const registerPreviewRenderer = renderer => previewRenderers.add(renderer)

export const unregisterPreviewRenderer = renderer => previewRenderers.delete(renderer)

export const previewRendererCount = () => previewRenderers.size

export const releaseAllPreviewContexts = () => {
  previewRenderers.forEach(renderer => {
    renderer.setAnimationLoop?.(null)
    renderer.dispose?.()
    renderer.forceContextLoss?.()
  })
  previewRenderers.clear()
}
