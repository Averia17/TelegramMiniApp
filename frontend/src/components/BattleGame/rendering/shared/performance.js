const isDevelopment = typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV)
const MAX_SAMPLES = 240

const getStore = () => globalThis.__battlePerf || (globalThis.__battlePerf = {})

const getEntry = name => {
  const stats = getStore()
  if (stats[name] && !Array.isArray(stats[name].values)) {
    stats[name] = {
      count: Number(stats[name].count) || 0,
      totalMs: Number(stats[name].totalMs) || 0,
      maxMs: Number(stats[name].maxMs) || 0,
      values: [],
      last: null,
    }
  }
  return stats[name] || (stats[name] = {
    count: 0,
    totalMs: 0,
    maxMs: 0,
    values: [],
    last: null,
  })
}

const addValue = (entry, value) => {
  if (!Number.isFinite(value)) return
  entry.count += 1
  entry.totalMs += value
  entry.maxMs = Math.max(entry.maxMs, value)
  entry.values.push(value)
  if (entry.values.length > MAX_SAMPLES) entry.values.shift()
}

const percentile = (values, fraction) => {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)
  return sorted[Math.max(0, index)]
}

/**
 * Record a bounded numeric sample and optional low-cardinality metadata.
 * Metrics stay local to the current page; callers can explicitly export the
 * snapshot to their telemetry backend when that integration exists.
 */
export const recordBattleMetric = (name, value, metadata = undefined) => {
  if (!name) return
  const entry = getEntry(name)
  addValue(entry, Number(value))
  if (metadata && typeof metadata === "object") entry.last = {...metadata}
}

export const getBattlePerformanceSnapshot = () => Object.fromEntries(
  Object.entries(getStore()).map(([name, entry]) => [name, {
    count: entry.count,
    totalMs: entry.totalMs,
    maxMs: entry.maxMs,
    averageMs: entry.count ? entry.totalMs / entry.count : 0,
    samples: entry.values.length,
    p50: percentile(entry.values, .5),
    p95: percentile(entry.values, .95),
    p99: percentile(entry.values, .99),
    last: entry.last,
  }]),
)

export const resetBattlePerformance = () => {
  globalThis.__battlePerf = {}
}

export const startBattlePerformance = name => isDevelopment && typeof performance !== "undefined"
  ? {name, startedAt: performance.now()}
  : null

export const endBattlePerformance = token => {
  if (!token) return
  recordBattleMetric(token.name, performance.now() - token.startedAt)
}
