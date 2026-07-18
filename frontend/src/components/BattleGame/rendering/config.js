// The world is rendered as a tilted 2.5D stage. A stronger Y compression is what
// makes circles become ground ellipses while characters remain upright.
// Brawl-like oblique ground projection. World X stays horizontal while world Y
// is foreshortened; actors are projected at their feet and remain upright.
export const DEPTH = 0.60
export const HERO_SCALE = 0.88

export const HERO_PALETTES = {
  blaze: {main: 0xc64bff, dark: 0x53234f, light: 0xff7ad9, skin: 0xd99671, accent: 0x62f3ff},
  frost: {main: 0x35aee8, dark: 0x203b68, light: 0xe8f4ff, skin: 0x37445f, accent: 0x54f2ff},
  viper: {main: 0xff7138, dark: 0x332b31, light: 0xffb13c, skin: 0x44333a, accent: 0xffdf55},
  titan: {main: 0x5142a6, dark: 0x242044, light: 0x8d7df1, skin: 0x34285b, accent: 0x58f6e9},
  shadow: {main: 0x55bd4e, dark: 0x2c633b, light: 0x9ce65b, skin: 0x75d98a, accent: 0xf0e94f},
  spark: {main: 0x39295e, dark: 0x1d172f, light: 0x7760aa, skin: 0xdedbf2, accent: 0x7dff63},
  nova: {main: 0x364f91, dark: 0x222d58, light: 0xf4f0de, skin: 0xd99873, accent: 0x70eaff},
  rex: {main: 0x9d2948, dark: 0x25253c, light: 0xd95d76, skin: 0xd59070, accent: 0x4bc7ff},
  pixel: {main: 0x5368c7, dark: 0x303a54, light: 0x8b9cff, skin: 0x3b4660, accent: 0xffdf4b},
  boulder: {main: 0x514033, dark: 0x302a34, light: 0xe1d7b7, skin: 0x75604c, accent: 0x65e357},
  default: {main: 0x4f91e8, dark: 0x2c4f9a, light: 0x81c9ff, skin: 0xe7a077, accent: 0xffd640, weapon: "blaster"},
}

