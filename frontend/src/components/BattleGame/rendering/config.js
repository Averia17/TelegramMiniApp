export const DEPTH = 0.88
export const HERO_SCALE = 1.22

export const DEFAULT_ARENA_SIZE = {
  width: 1024,
  height: 768,
}

export const HERO_PALETTES = {
  blaze: {main: 0xf04b32, dark: 0x9d2331, light: 0xffa63d, skin: 0xf2a06f, accent: 0xffd33d, weapon: "blaster"},
  frost: {main: 0x42bde8, dark: 0x2857a8, light: 0xa8f1ff, skin: 0xe8b18d, accent: 0xe9fbff, weapon: "blaster"},
  viper: {main: 0x56c858, dark: 0x19743e, light: 0xb5ec55, skin: 0xc98760, accent: 0xf4eb43, weapon: "dagger"},
  titan: {main: 0xb16a3d, dark: 0x653344, light: 0xeaa951, skin: 0x8f583f, accent: 0x67d7f3, weapon: "cannon"},
  shadow: {main: 0x7148bc, dark: 0x332365, light: 0xb787f3, skin: 0x9a6254, accent: 0xf15ece, weapon: "dagger"},
  spark: {main: 0xf1bd28, dark: 0xa44b29, light: 0xffef69, skin: 0xe5a06d, accent: 0x56e7ff, weapon: "blaster"},
  nova: {main: 0xe75caa, dark: 0x8e376e, light: 0xffa3da, skin: 0xb87560, accent: 0x75eeff, weapon: "orb"},
  rex: {main: 0x4cac57, dark: 0x22603d, light: 0x9bd14c, skin: 0xd48e5e, accent: 0xffd543, weapon: "claw"},
  pixel: {main: 0xe64b9e, dark: 0x633889, light: 0xff8bc8, skin: 0xf2b08a, accent: 0x68f6ff, weapon: "rifle"},
  boulder: {main: 0x9c7356, dark: 0x52434c, light: 0xd6a46f, skin: 0x96705a, accent: 0xf2c95c, weapon: "fists"},
  default: {main: 0x4f91e8, dark: 0x2c4f9a, light: 0x81c9ff, skin: 0xe7a077, accent: 0xffd640, weapon: "blaster"},
}

export const getRenderScale = width => ({
  resolution: Math.min(window.devicePixelRatio || 1, width < 700 ? 1.5 : 2),
  zoom: width < 700 ? 1.05 : 1.2,
})
