const isDevelopment = typeof import.meta !== "undefined" && import.meta.env?.DEV

export const startBattlePerformance = name => isDevelopment && typeof performance !== "undefined"
  ? {name, startedAt: performance.now()}
  : null

export const endBattlePerformance = token => {
  if (!token) return
  const elapsed = performance.now() - token.startedAt
  const stats = globalThis.__battlePerf || (globalThis.__battlePerf = {})
  const current = stats[token.name] || {count: 0, totalMs: 0, maxMs: 0}
  current.count += 1
  current.totalMs += elapsed
  current.maxMs = Math.max(current.maxMs, elapsed)
  stats[token.name] = current
}
