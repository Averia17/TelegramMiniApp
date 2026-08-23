const PHASES = new Set(["cast", "telegraph", "active", "impact"])

const TELEGRAPH_KINDS = new Set(["zeus_strike_warning", "tower_telegraph", "needle_root_telegraph", "mandy_super_charge"])
const ACTIVE_KINDS = new Set([
  "zeus_beam_hole", "zeus_storm_target", "zeus_thunderbrand",
  "lumi_roots", "lumi_flower", "needle_root_cast", "needle_root_active", "needle_moisture_reserve", "needle_spore_cloud",
  "katty_paint_cloud", "katty_paint_puddle", "katty_paint_trail",
  "mina_healing_aura", "kaze_veil_step", "kaze_followup_ready",
  "mico_staff_spin", "mico_ruyi_bind", "mico_suppressed_rage", "mandy_stance",
  "vortex", "vine", "spin", "zeus_fire_ground", "needle_spores",
  "mandy_super_wave",
])
const IMPACT_KINDS = new Set([
  "mina_mark_burst", "mina_mark_break", "needle_root_burst", "needle_root_pull", "needle_anti_heal", "needle_spore_stun",
  "katty_paint_impact", "katty_paint_stick", "lumi_root_impact", "lumi_seedburst",
  "lightning", "zeus_lightning_strike", "zeus_lightning_blast", "mico_skyfall", "mico_armor_burst", "burst", "evade", "damage", "crate_hit", "crate_break", "rock",
  "mina_air_wave", "wall_break", "objective_hit", "tower_shot_blocked", "collapse", "kaze_cross_slash",
])

const FALLBACK_PHASES = new Map([
  ...[...TELEGRAPH_KINDS].map(kind => [kind, "telegraph"]),
  ...[...ACTIVE_KINDS].map(kind => [kind, "active"]),
  ...[...IMPACT_KINDS].map(kind => [kind, "impact"]),
])

export const getCombatEffectPhase = effect => {
  const authoritative = String(effect?.phase || "")
  if (PHASES.has(authoritative)) return authoritative
  return FALLBACK_PHASES.get(String(effect?.kind || "")) || "cast"
}

export const getCombatEffectPhaseLabel = effect => ({
  cast: "ЗАМАХ",
  telegraph: "ТЕЛЕГРАФ",
  active: "ЗОНА",
  impact: "УДАР",
}[getCombatEffectPhase(effect)])
