const TELEGRAM_FULLSCREEN_VERSION = "8.0"
const TELEGRAM_VERTICAL_SWIPE_VERSION = "7.7"
const TELEGRAM_BOT_USERNAME = "TestUpMiniAppBot"
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

export const setupTelegramActivity = (platform = globalThis, onChange = () => {}) => {
  const webApp = getTelegramWebApp(platform)
  if (!webApp) return () => {}

  const setActive = active => onChange(Boolean(active))
  const activated = () => setActive(true)
  const deactivated = () => setActive(false)
  setActive(webApp.isActive !== false)
  webApp.onEvent?.("activated", activated)
  webApp.onEvent?.("deactivated", deactivated)

  return () => {
    webApp.offEvent?.("activated", activated)
    webApp.offEvent?.("deactivated", deactivated)
  }
}

export const setupTelegramBackButton = (platform = globalThis, onClick = null) => {
  const backButton = getTelegramWebApp(platform)?.BackButton
  if (!backButton || typeof onClick !== "function") return () => {}

  try {
    backButton.show?.()
    backButton.onClick?.(onClick)
  } catch (_error) {
    return () => {}
  }

  return () => {
    try {
      backButton.hide?.()
      backButton.offClick?.(onClick)
    } catch (_error) {
      // A partially implemented Telegram client must not break route cleanup.
    }
  }
}

const TELEGRAM_HAPTIC_METHODS = {
  impact: "impactOccurred",
  notification: "notificationOccurred",
  selection: "selectionChanged",
}

export const triggerTelegramHaptic = (platform = globalThis, kind, value) => {
  const haptic = getTelegramWebApp(platform)?.HapticFeedback
  const method = TELEGRAM_HAPTIC_METHODS[kind]
  if (!haptic || !method || typeof haptic[method] !== "function") return false
  try {
    if (value === undefined) haptic[method]()
    else haptic[method](value)
    return true
  } catch (_error) {
    return false
  }
}

export const buildTelegramInviteLink = (playerId) => {
  const normalizedPlayerId = String(playerId ?? "").trim()
  if (!/^\d+$/.test(normalizedPlayerId)) return ""
  return `https://t.me/${TELEGRAM_BOT_USERNAME}?startapp=${encodeURIComponent(`inviterId${normalizedPlayerId}`)}`
}

const getBattleShareText = result => {
  if (result?.draw) return "У нас ничья в TestUp Arena. Попробуй переиграть меня!"
  if (result?.won) return "Я победил в TestUp Arena. Попробуй меня одолеть!"
  return "Я сыграл в TestUp Arena. Заходи и попробуй победить меня!"
}

export const shareTelegramBattleResult = async (platform = globalThis, {playerId, result} = {}) => {
  const inviteLink = buildTelegramInviteLink(playerId)
  if (!inviteLink) return false

  const text = getBattleShareText(result)
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent(text)}`
  const webApp = getTelegramWebApp(platform)
  if (typeof webApp?.openTelegramLink === "function") {
    try {
      webApp.openTelegramLink(shareUrl)
      return true
    } catch (_error) {
      // Fall through to browser sharing when the Telegram client rejects the link.
    }
  }

  const navigator = platform?.navigator
  if (typeof navigator?.share === "function") {
    try {
      await navigator.share({title: "TestUp Arena", text, url: inviteLink})
      return true
    } catch (_error) {
      return false
    }
  }

  if (typeof platform?.open === "function") {
    platform.open(shareUrl, "_blank", "noopener,noreferrer")
    return true
  }

  if (typeof navigator?.clipboard?.writeText === "function") {
    try {
      await navigator.clipboard.writeText(inviteLink)
      return true
    } catch (_error) {
      return false
    }
  }
  return false
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
