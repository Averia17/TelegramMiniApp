const MOBILE_MAX_WIDTH = 700

export const isMobileLandscape = ({width, height, coarsePointer = false} = {}) => {
  const viewportWidth = Number(width) || 0
  const viewportHeight = Number(height) || 0
  return (Boolean(coarsePointer) || viewportWidth <= MOBILE_MAX_WIDTH) && viewportWidth > viewportHeight
}

const supportsTelegramOrientationLock = webApp => {
  if (typeof webApp?.lockOrientation !== "function") return false
  if (!webApp.version) return true
  const version = Number.parseFloat(webApp.version)
  return Number.isFinite(version) && version >= 8
}

export const requestPortraitOrientationLock = (platform = globalThis.window) => {
  const telegramWebApp = platform?.Telegram?.WebApp
  try {
    if (supportsTelegramOrientationLock(telegramWebApp)) telegramWebApp.lockOrientation()
  } catch (_error) {
    // The browser fallback below may still be available when Telegram's API
    // is missing or rejects the request.
  }

  const orientation = platform?.screen?.orientation
  if (typeof orientation?.lock !== "function") return Promise.resolve(false)
  try {
    return Promise.resolve(orientation.lock.call(orientation, "portrait"))
      .then(() => true)
      .catch(() => false)
  } catch (_error) {
    return Promise.resolve(false)
  }
}
