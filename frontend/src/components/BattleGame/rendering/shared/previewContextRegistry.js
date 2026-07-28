const previewRenderers = new Set()

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
