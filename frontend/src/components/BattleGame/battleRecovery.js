export const normalizeRecoveredBattleResult = result => ({
  ...result,
  recovered: true,
  ...(result?.teamBattle || String(result?.mode || "").toLowerCase() === "team deathmatch" ? {teamBattle: true} : {}),
  duration: Math.max(0, Math.round(Number(result?.duration || 0) / 1000)),
})

export const BATTLE_RECOVERY_TIMEOUT_MS = 10_000
export const BATTLE_RECONNECT_INITIAL_DELAY_MS = 1_000
export const BATTLE_RECONNECT_MAX_DELAY_MS = 5_000

export const getBattleReconnectDelay = (attempt = 0) => {
  const normalizedAttempt = Math.max(0, Math.floor(Number(attempt) || 0))
  return Math.min(
    BATTLE_RECONNECT_MAX_DELAY_MS,
    BATTLE_RECONNECT_INITIAL_DELAY_MS * (2 ** normalizedAttempt),
  )
}

export const getBattleRecoveryTimeoutDecision = ({startNewBattle = false} = {}) => (
  startNewBattle ? {kind: "new"} : {kind: "menu"}
)

export const getBattleRecoveryDecision = ({status, roomId, result, startNewBattle = false} = {}) => {
  // A deliberate new-battle intent must never recover the previous room. The
  // server can briefly report a finished match as active while its room is
  // being torn down, so recovery has to yield to the player's explicit action.
  if (startNewBattle) return {kind: "new"}
  if (status === "active" && roomId) return {kind: "resume", roomId}
  if (status === "finished" && result) {
    return {kind: "result", result: normalizeRecoveredBattleResult(result)}
  }
  return {kind: "menu"}
}
