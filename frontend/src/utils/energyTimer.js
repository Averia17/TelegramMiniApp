export function getEnergyRemainingSeconds(snapshot, now = Date.now()) {
  const energy = Number(snapshot?.energy ?? 0)
  const maxEnergy = Number(snapshot?.max_energy ?? 0)
  if (maxEnergy > 0 && energy >= maxEnergy) return 0

  const initialSeconds = Number(snapshot?.next_energy_in)
  if (!Number.isFinite(initialSeconds) || initialSeconds <= 0) return 0

  const syncedAt = Number(snapshot?._syncedAt)
  if (!Number.isFinite(syncedAt)) return Math.max(0, Math.ceil(initialSeconds))

  return Math.max(0, Math.ceil(initialSeconds - Math.max(0, now - syncedAt) / 1000))
}

export function formatEnergyCountdown(seconds) {
  if (seconds <= 0) return "полная"
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = String(seconds % 60).padStart(2, "0")
  return `${String(minutes).padStart(2, "0")}:${remainingSeconds}`
}
