export const formatBattleTime = (endsAt, now = Date.now()) => {
  const remainingSeconds = Math.max(0, Math.ceil((Number(endsAt) - Number(now)) / 1000))
  return `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, "0")}`
}
