const TELEGRAM_FULLSCREEN_VERSION = "8.0"
const TELEGRAM_VERTICAL_SWIPE_VERSION = "7.7"
const INSET_SIDES = ["top", "right", "bottom", "left"]

export const getTelegramWebApp = (platform = globalThis) => platform?.Telegram?.WebApp || null

const parseVersion = version => String(version || "")
  .split(".")
  .map(part => Number.parseInt(part, 10))
  .map(part => Number.isFinite(part) ? part : 0)

export const isTelegramVersionAtLeast = (webApp, requiredVersion) => {
  if (!webApp) return false
  if (typeof webApp.isVersionAtLeast === "function") {
    try {
      return Boolean(webApp.isVersionAtLeast(requiredVersion))
    } catch (_error) {
      // Fall through to the version string when an older client has a broken
      // or partially implemented capability check.
    }
  }
  if (!webApp.version) return true
  const actual = parseVersion(webApp.version)
  const required = parseVersion(requiredVersion)
  for (let index = 0; index < Math.max(actual.length, required.length); index += 1) {
    if ((actual[index] || 0) !== (required[index] || 0)) {
      return (actual[index] || 0) > (required[index] || 0)
    }
  }
  return true
}

const getInset = (inset, side) => {
  const value = Number(inset?.[side])
  return Number.isFinite(value) && value > 0 ? value : 0
}

export const syncTelegramViewportCss = (webApp, document = globalThis.document) => {
  const root = document?.documentElement
  if (!root?.style) return false

  const safeArea = webApp?.safeAreaInset || {}
  const contentSafeArea = webApp?.contentSafeAreaInset || {}
  INSET_SIDES.forEach(side => {
    const safeValue = getInset(safeArea, side)
    const contentValue = getInset(contentSafeArea, side)
    root.style.setProperty(`--telegram-safe-area-inset-${side}`, `${safeValue}px`)
    root.style.setProperty(`--telegram-content-safe-area-inset-${side}`, `${contentValue}px`)
    root.style.setProperty(`--telegram-safe-${side}`, `${Math.max(safeValue, contentValue)}px`)
  })

  const stableHeight = Number(webApp?.viewportStableHeight)
  const viewportHeight = Number(webApp?.viewportHeight)
  const height = stableHeight > 0 ? stableHeight : viewportHeight
  if (Number.isFinite(height) && height > 0) {
    root.style.setProperty("--telegram-viewport-height", `${height}px`)
  }
  return true
}

export const setupTelegramWebApp = (platform = globalThis) => {
  const webApp = getTelegramWebApp(platform)
  if (!webApp) return () => {}

  webApp.ready?.()
  const sync = () => syncTelegramViewportCss(webApp, platform.document)
  sync()

  const events = ["safeAreaChanged", "contentSafeAreaChanged", "viewportChanged"]
  events.forEach(eventName => webApp.onEvent?.(eventName, sync))
  return () => events.forEach(eventName => webApp.offEvent?.(eventName, sync))
}

const callSafely = (webApp, method) => {
  if (typeof webApp?.[method] !== "function") return false
  try {
    webApp[method]()
    return true
  } catch (_error) {
    return false
  }
}

export const enterTelegramBattleMode = (platform = globalThis) => {
  const webApp = getTelegramWebApp(platform)
  if (!webApp) return {fullscreenRequested: false, verticalSwipesDisabled: false}

  callSafely(webApp, "expand")
  const fullscreenRequested = isTelegramVersionAtLeast(webApp, TELEGRAM_FULLSCREEN_VERSION)
    && callSafely(webApp, "requestFullscreen")
  const verticalSwipesDisabled = isTelegramVersionAtLeast(webApp, TELEGRAM_VERTICAL_SWIPE_VERSION)
    && callSafely(webApp, "disableVerticalSwipes")
  return {fullscreenRequested, verticalSwipesDisabled}
}

export const leaveTelegramBattleMode = (platform = globalThis) => {
  const webApp = getTelegramWebApp(platform)
  if (!webApp) return
  if (isTelegramVersionAtLeast(webApp, TELEGRAM_FULLSCREEN_VERSION)) callSafely(webApp, "exitFullscreen")
  if (isTelegramVersionAtLeast(webApp, TELEGRAM_VERTICAL_SWIPE_VERSION)) callSafely(webApp, "enableVerticalSwipes")
}
