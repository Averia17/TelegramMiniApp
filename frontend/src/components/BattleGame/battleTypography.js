// Nunito keeps the combat UI friendly and readable without the hard, pixel-like
// silhouette the previous Impact/Arial mix created in small canvas labels.
export const BATTLE_FONT_FAMILY = "\"Nunito\", \"Arial Rounded MT Bold\", Arial, sans-serif"

export const BATTLE_FONT_SIZES = Object.freeze({
  heroName: 21,
  heroNameCompact: 20,
  health: 14,
  marker: 10,
})

// World-space health labels use different canvas/sprite scales. Keeping their
// final height in world units makes hero, monster, chest, and objective HP read
// as one visual system instead of four unrelated pixel values.
export const BATTLE_HEALTH_WORLD_HEIGHT = 0.26

export const battleCanvasFont = (weight, size) => `${weight} ${size}px ${BATTLE_FONT_FAMILY}`

export const getBattleHealthFontSize = ({canvasHeight, spriteHeight, parentScale = 1}) => (
  Math.max(10, Math.round(BATTLE_HEALTH_WORLD_HEIGHT * canvasHeight / (spriteHeight * parentScale)))
)

export const getBattleViewportFontSize = (desktopSize, compactSize = desktopSize) => {
  if (typeof window === "undefined") return desktopSize
  const isCompact = window.matchMedia?.("(pointer: coarse), (max-width: 700px)").matches
  return isCompact ? compactSize : desktopSize
}
