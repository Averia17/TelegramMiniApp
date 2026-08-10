const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

const healthValues = state => {
  const maximum = Math.max(1, Math.round(Number(state?.maxLives) || 1))
  const current = Math.max(0, Math.min(maximum, Math.round(Number(state?.lives) || 0)))
  return {current, maximum}
}

export const getHeroHealthFraction = state => {
  const {current, maximum} = healthValues(state)
  return clamp(current / maximum, 0, 1)
}

export const formatHeroHealthLabel = state => {
  const {current, maximum} = healthValues(state)
  return `${current} / ${maximum}`
}
