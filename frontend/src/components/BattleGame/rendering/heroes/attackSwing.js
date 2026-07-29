const clamp01 = value => Math.max(0, Math.min(1, value))
const smoothstep = value => {
  const progress = clamp01(value)
  return progress * progress * (3 - 2 * progress)
}

const WINDUP_END = 0.18
const STRIKE_END = 0.68

export const getAttackSwingYaw = (phase, halfArcDegrees) => {
  const halfArc = Number(halfArcDegrees) * Math.PI / 180
  if (!Number.isFinite(halfArc) || halfArc <= 0) return 0

  const progress = clamp01(Number(phase) || 0)
  if (progress === 0 || progress === 1) return 0
  if (progress < WINDUP_END) {
    return -halfArc * smoothstep(progress / WINDUP_END)
  }
  if (progress <= STRIKE_END) {
    const strikeProgress = smoothstep((progress - WINDUP_END) / (STRIKE_END - WINDUP_END))
    return -halfArc + strikeProgress * halfArc * 2
  }
  return halfArc * (1 - smoothstep((progress - STRIKE_END) / (1 - STRIKE_END)))
}
