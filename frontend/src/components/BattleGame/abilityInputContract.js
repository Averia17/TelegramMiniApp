// Kept as a small runtime view instead of importing the JSON contract. Node's
// native ESM runner requires an import assertion for JSON while Vite does not;
// this table keeps the browser input path testable in both environments. The
// Python contract validator remains the source-of-truth drift gate.
const ABILITY_TARGETS = Object.freeze({
  spore_thorn: "directional_projectile",
  hunter_root: "point_zone",
  spore_escape: "directional_self_dash",
  staff_strike: "directional_cone",
  devastation_wave: "directional_line",
  unyielding_stance: "self",
  star_fan: "directional_fan",
  star_cocoon: "self_zone",
  repelling_wave: "radial_self",
  thunder_projectile: "directional_projectile",
  gods_hammer: "point_strikes",
  discharge_cable: "directional_line",
  heavy_staff: "directional_cone",
  vengeance_vortex: "directional_self_zone",
  stone_armor: "self",
  luminous_flower: "directional_projectile",
  root_garden: "point_zone",
  flower_burst: "self_setup_zone",
  cross_slash: "directional_enemy",
  piercing_dash: "directional_enemy_line",
  vanish: "self",
  paint_spray: "directional_cone",
  paint_grenade: "point_zone",
  paint_flight: "self",
})

const HERO_ABILITY_IDS = Object.freeze({
  Needle: {basic: "spore_thorn", super: "hunter_root", gadget: "spore_escape"},
  Mandy: {basic: "staff_strike", super: "devastation_wave", gadget: "unyielding_stance"},
  "Fairy Mina": {basic: "star_fan", super: "star_cocoon", gadget: "repelling_wave"},
  "Brock Zeus": {basic: "thunder_projectile", super: "gods_hammer", gadget: "discharge_cable"},
  "Wukong Mico": {basic: "heavy_staff", super: "vengeance_vortex", gadget: "stone_armor"},
  "Persephone Lumi": {basic: "luminous_flower", super: "root_garden", gadget: "flower_burst"},
  Kaze: {basic: "cross_slash", super: "piercing_dash", gadget: "vanish"},
  Katty: {basic: "paint_spray", super: "paint_grenade", gadget: "paint_flight"},
})

const modeForTarget = target => {
  const value = String(target || "").toLowerCase()
  if (value.startsWith("targeted")) return "targeted"
  if (value.startsWith("point")) return "point"
  if (value.startsWith("directional")) return "directional"
  if (value.startsWith("self")) return "self"
  if (value.startsWith("radial")) return "self"
  return "directional"
}

export const resolveAbilityInputContract = ability => Object.freeze({
  target: String(ability?.target || "directional"),
  mode: modeForTarget(ability?.target),
})

export const getHeroAbilityInputContract = (hero, slot) => {
  const heroName = String(hero || "")
  const abilitySlot = slot === "primary" ? "super" : slot === "secondary" ? "gadget" : "basic"
  return resolveAbilityInputContract({target: ABILITY_TARGETS[HERO_ABILITY_IDS[heroName]?.[abilitySlot]]})
}

export const buildAbilityInput = ({contract, aimAngle, aimDistance, targetId} = {}) => {
  const resolved = contract || resolveAbilityInputContract()
  if (resolved.mode === "self") return {targeting: "self"}
  if (resolved.mode === "targeted") return {targeting: "targeted", ...(targetId ? {targetId} : {})}
  return {
    targeting: resolved.mode,
    aimProvided: Number.isFinite(Number(aimAngle)) && Number.isFinite(Number(aimDistance)),
    aimAngle: Number(aimAngle) || 0,
    aimDistance: Math.max(0, Number(aimDistance) || 0),
  }
}
