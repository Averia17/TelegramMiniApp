export const FLIGHT_HOVER_HEIGHT = 4.75
export const FLIGHT_BOB_HEIGHT = .08

const FLIGHT_ASCEND_SPEED = 20
const FLIGHT_DESCEND_SPEED = 10

export const isFlightActive = state => Number(state?.flying) > 0

export const getFlightTargetHeight = state => isFlightActive(state) ? FLIGHT_HOVER_HEIGHT : 0

export const advanceFlightVisualHeight = (height, state, delta) => {
  const currentHeight = Number.isFinite(Number(height)) ? Math.max(0, Number(height)) : 0
  const safeDelta = Number.isFinite(Number(delta)) ? Math.max(0, Number(delta)) : 0
  const targetHeight = getFlightTargetHeight(state)
  const speed = isFlightActive(state) ? FLIGHT_ASCEND_SPEED : FLIGHT_DESCEND_SPEED
  return currentHeight + (targetHeight - currentHeight) * (1 - Math.exp(-speed * safeDelta))
}

export const getFlightBodyHeight = (height, time) => {
  const safeHeight = Number.isFinite(Number(height)) ? Math.max(0, Number(height)) : 0
  if (safeHeight <= 0) return 0
  const safeTime = Number.isFinite(Number(time)) ? Number(time) : 0
  return Math.max(0, safeHeight + Math.sin(safeTime * 11) * FLIGHT_BOB_HEIGHT)
}
