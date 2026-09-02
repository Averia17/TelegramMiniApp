const readStoredFlag = (storage, key) => {
  try {
    return storage?.getItem(key) === "1"
  } catch {
    return false
  }
}

export const getCombatAccessibilityPreferences = (environment = globalThis) => {
  const reducedMotion = Boolean(
    environment?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches,
  )
  const reducedShake = reducedMotion || readStoredFlag(environment?.localStorage, "combat.reducedShake")
  const reducedFlash = reducedMotion || readStoredFlag(environment?.localStorage, "combat.reducedFlash")
  const reducedAudio = readStoredFlag(environment?.localStorage, "combat.reducedAudio")
  return {reducedMotion, reducedShake, reducedFlash, reducedAudio}
}
