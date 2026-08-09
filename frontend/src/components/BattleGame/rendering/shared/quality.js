export const isSoftwareWebGLRenderer = rendererName =>
  /(swiftshader|llvmpipe|software renderer|software rasterizer|mesa)/i.test(String(rendererName || ""))

export const isSoftwareWebGLContext = context => {
  const extension = context?.getExtension?.("WEBGL_debug_renderer_info")
  if (!extension) return false
  const rendererName = context.getParameter?.(extension.UNMASKED_RENDERER_WEBGL)
  return isSoftwareWebGLRenderer(rendererName)
}

export const detectLowQualityDevice = () =>
  (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4

export const pixelRatioFor = (lowQuality, softwareWebGL = false) =>
  Math.min(window.devicePixelRatio || 1, lowQuality ? softwareWebGL ? 0.35 : 0.75 : 1.5)
