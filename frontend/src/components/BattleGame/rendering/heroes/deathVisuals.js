const clamp01 = value => Math.max(0, Math.min(1, value))
const smoothstep = value => {
  const t = clamp01(value)
  return t * t * (3 - 2 * t)
}

export const DEATH_PULSE_DURATION = .72

const HERO_DEATH_PALETTES = {
  "Needle": [0x72df6d, 0xf4efad, 0xff72bb],
  "Mandy": [0xff63b4, 0xffdf55, 0x8e66ff],
  "Fairy Mina": [0xff83e6, 0x7deaff, 0xfff19b],
  "Brock Zeus": [0x43cfff, 0xf6fbff, 0x765dff],
  "Kaze": [0xff5a83, 0xdcc5ff, 0x5be5dc],
  "Wukong Mico": [0xffc44f, 0xff6e45, 0xeef5ff],
  "Persephone Lumi": [0xb96cff, 0x69e7d1, 0xf6d16b],
  "Katty": [0xff66ae, 0x7e5cff, 0x5de9ff],
}

export const getHeroDeathPalette = heroName => (
  HERO_DEATH_PALETTES[heroName] || [0x8c7cff, 0xf4f0ff, 0x62dce7]
)

export const getDeathPulseState = elapsed => {
  const progress = clamp01(elapsed / DEATH_PULSE_DURATION)
  const expansion = 1 - Math.pow(1 - progress, 3)
  const fade = 1 - smoothstep((progress - .24) / .76)
  return {
    ringScale: .15 + expansion * 2.35,
    ringOpacity: progress >= 1 ? 0 : fade * .82,
    flashOpacity: progress >= 1 ? 0 : Math.sin(Math.min(1, progress / .58) * Math.PI) * fade * .72,
  }
}

export const getDeathFade = progress => (
  progress <= .75 ? 1 : 1 - smoothstep((progress - .75) / .25)
)

export const getDeathShakeAmount = (previous, next, isLocal) => {
  if (Number(previous?.lives) <= 0 || Number(next?.lives) > 0) return 0
  return isLocal ? .2 : .11
}
