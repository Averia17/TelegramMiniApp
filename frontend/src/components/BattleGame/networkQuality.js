const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback

const bestRoundTripMs = samples => {
  const values = (Array.isArray(samples) ? samples : [])
    .map(sample => finite(sample?.roundTripMs, Infinity))
    .filter(value => Number.isFinite(value) && value >= 0)
  return values.length > 0 ? Math.min(...values) : null
}

export const getNetworkQuality = ({
  connected = false,
  lastStateReceivedAt = 0,
  stateHz = 0,
  clockSyncSamples = [],
  now = Date.now(),
} = {}) => {
  if (!connected) {
    return {
      state: "offline",
      label: "СВЯЗЬ ПОТЕРЯНА",
      detail: "Переподключаемся к арене",
      ageMs: null,
      stateHz: 0,
      rttMs: null,
    }
  }

  const receivedAt = finite(lastStateReceivedAt)
  const ageMs = receivedAt > 0 ? Math.max(0, finite(now) - receivedAt) : Infinity
  const hz = Math.max(0, finite(stateHz))
  const rttMs = bestRoundTripMs(clockSyncSamples)
  const isPoor = ageMs > 900 || hz < 5 || (rttMs !== null && rttMs > 320)
  const isWarning = ageMs > 450 || hz < 10 || (rttMs !== null && rttMs > 180)
  const state = isPoor ? "poor" : isWarning ? "warning" : "good"

  return {
    state,
    label: state === "poor" ? "СВЯЗЬ ПРЕРЫВАЕТСЯ" : state === "warning" ? "СЛАБАЯ СВЯЗЬ" : "СВЯЗЬ СТАБИЛЬНА",
    detail: state === "poor" ? "Движение и попадания могут запаздывать" : state === "warning" ? "Возможны задержки обновления арены" : "",
    ageMs: Number.isFinite(ageMs) ? ageMs : null,
    stateHz: hz,
    rttMs,
  }
}
