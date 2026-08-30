const DEFAULT_GRAPHICS_PROFILE = {
  performanceClass: "unknown",
  maxPixelRatio: 1.5,
  antialias: true,
}

export const getTelegramPerformanceClass = (platform = globalThis) => {
  const userAgent = String(platform?.navigator?.userAgent || "")
  if (!/Telegram-Android\//i.test(userAgent)) return "unknown"
  const match = userAgent.match(/\b(LOW|AVERAGE|HIGH)\b/i)
  return match ? match[1].toLowerCase() : "unknown"
}

export const getTelegramGraphicsProfile = (platform = globalThis) => {
  const performanceClass = getTelegramPerformanceClass(platform)
  if (performanceClass === "low") {
    return {performanceClass, maxPixelRatio: 1, antialias: false}
  }
  if (performanceClass === "average") {
    return {performanceClass, maxPixelRatio: 1.25, antialias: true}
  }
  return {...DEFAULT_GRAPHICS_PROFILE, performanceClass}
}
