export const detectLowQualityDevice = () =>
  (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4

export const pixelRatioFor = lowQuality =>
  Math.min(window.devicePixelRatio || 1, lowQuality ? 1 : 1.5)
