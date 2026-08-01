const shortestAngleDelta = (from, to) =>
  Math.atan2(Math.sin(to - from), Math.cos(to - from))

const clamp = (value, minimum, maximum) =>
  Math.max(minimum, Math.min(maximum, value))

export const blendAngle = (current, target, amount = 1) => {
  const safeAmount = clamp(Number(amount) || 0, 0, 1)
  const delta = shortestAngleDelta(current, target)
  return current + delta * safeAmount
}

export const advanceSmoothTurn = (
  current,
  target,
  velocity,
  delta,
  responsiveness = 9,
  maximumTurnSpeed = 6.5,
  maximumTurnAcceleration = 28,
) => {
  const safeDelta = Math.max(0, delta)
  if (safeDelta === 0) return {angle: current, velocity}

  const angleDelta = shortestAngleDelta(current, target)
  const desiredVelocity = clamp(
    angleDelta * responsiveness,
    -maximumTurnSpeed,
    maximumTurnSpeed,
  )
  const velocityChange = clamp(
    desiredVelocity - velocity,
    -maximumTurnAcceleration * safeDelta,
    maximumTurnAcceleration * safeDelta,
  )
  const nextVelocity = velocity + velocityChange
  const step = nextVelocity * safeDelta

  if (Math.sign(step) === Math.sign(angleDelta) && Math.abs(step) >= Math.abs(angleDelta)) {
    return {angle: current + angleDelta, velocity: 0}
  }
  return {angle: current + step, velocity: nextVelocity}
}

export const turnTowardsAngle = (
  current,
  target,
  delta,
  responsiveness = 9,
  maximumTurnSpeed = 6.5,
) => {
  const safeDelta = Math.max(0, delta)
  const desiredStep = shortestAngleDelta(current, target) * (1 - Math.exp(-responsiveness * safeDelta))
  const maximumStep = maximumTurnSpeed * safeDelta
  return current + clamp(desiredStep, -maximumStep, maximumStep)
}
