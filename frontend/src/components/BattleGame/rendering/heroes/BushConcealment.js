import * as THREE from "three"

export const BUSH_HERO_OPACITY = 0.72

export const getBushConcealmentMix = (current, concealed, delta) => {
  const target = concealed ? 1 : 0
  const response = concealed ? 8 : 12
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-response * Math.max(0, delta)))
}
