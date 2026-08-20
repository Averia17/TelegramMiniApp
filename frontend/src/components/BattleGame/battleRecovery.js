export const normalizeRecoveredBattleResult = result => ({
  ...result,
  recovered: true,
  teamBattle: result?.teamBattle || String(result?.mode || "").toLowerCase() === "team deathmatch",
  duration: Math.max(0, Math.round(Number(result?.duration || 0) / 1000)),
})

export const getBattleRecoveryDecision = ({status, roomId, result, startNewBattle = false} = {}) => {
  if (status === "active" && roomId) return {kind: "resume", roomId}
  if (status === "finished" && result && !startNewBattle) {
    return {kind: "result", result: normalizeRecoveredBattleResult(result)}
  }
  if (status === "none" || (status === "finished" && startNewBattle)) {
    return startNewBattle ? {kind: "new"} : {kind: "menu"}
  }
  return {kind: "menu"}
}
