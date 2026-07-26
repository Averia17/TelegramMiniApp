const shortestAngleDelta = (from, to) =>
  Math.atan2(Math.sin(to - from), Math.cos(to - from))

export const turnTowardsAngle = (current, target, delta, responsiveness = 9) =>
  current + shortestAngleDelta(current, target) * (1 - Math.exp(-responsiveness * delta))
