export const MOVE_DIRECTION_COUNT = 8
export const ATTACK_DIRECTION_COUNT = 32

const DIAGONAL_COMPONENT = Math.SQRT1_2
const EIGHT_WAY_DIRECTIONS = [
  {x: 1, y: 0},
  {x: DIAGONAL_COMPONENT, y: DIAGONAL_COMPONENT},
  {x: 0, y: 1},
  {x: -DIAGONAL_COMPONENT, y: DIAGONAL_COMPONENT},
  {x: -1, y: 0},
  {x: -DIAGONAL_COMPONENT, y: -DIAGONAL_COMPONENT},
  {x: 0, y: -1},
  {x: DIAGONAL_COMPONENT, y: -DIAGONAL_COMPONENT},
]

export function normalizeEightWayMove(dx, dy) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) <= 1e-9) {
    return {x: 0, y: 0}
  }

  const sector = Math.round(Math.atan2(dy, dx) / (Math.PI * 2 / MOVE_DIRECTION_COUNT))
  const index = ((sector % MOVE_DIRECTION_COUNT) + MOVE_DIRECTION_COUNT) % MOVE_DIRECTION_COUNT
  return EIGHT_WAY_DIRECTIONS[index]
}

export function quantizeAngleToSectors(angle, sectors = ATTACK_DIRECTION_COUNT) {
  if (!Number.isFinite(angle) || !Number.isInteger(sectors) || sectors < 1) return 0
  const step = Math.PI * 2 / sectors
  const normalized = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
  return (Math.round(normalized / step) * step) % (Math.PI * 2)
}
