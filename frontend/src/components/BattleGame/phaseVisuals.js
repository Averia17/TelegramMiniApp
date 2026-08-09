const clamp01 = value => Math.max(0, Math.min(1, value))

export const ISLAND_PHASE_ORDER = Object.freeze(["hunt", "challenge", "collapse", "beacon"])

export const ISLAND_PHASE_ATMOSPHERES = Object.freeze({
  hunt: Object.freeze({color: 0x254c38, opacity: .035}),
  challenge: Object.freeze({color: 0x4b2d70, opacity: .065}),
  collapse: Object.freeze({color: 0x5b193e, opacity: .13}),
  beacon: Object.freeze({color: 0x8b5a1f, opacity: .09}),
})

export const getIslandPhaseIndex = phase => {
  const index = ISLAND_PHASE_ORDER.indexOf(phase)
  return index === -1 ? 0 : index
}

export const getIslandPhaseProgress = (state, now = Date.now()) => {
  if (!state?.phase) return 0
  const startedAt = Number(state.phaseStartedAt)
  const endsAt = Number(state.phaseEndsAt)
  if (Number.isFinite(startedAt) && Number.isFinite(endsAt) && endsAt > startedAt) {
    return clamp01((Number(now) - startedAt) / (endsAt - startedAt))
  }
  return state.phase === "beacon" ? clamp01(Number(state.beaconProgress) || 0) : 0
}
