export const COMBAT_EFFECT_PHASES = Object.freeze([
  "intent", "cast", "telegraph", "active", "impact", "status", "recovery",
])
const PHASES = new Set(COMBAT_EFFECT_PHASES)
const PHASE_ALIASES = new Map([
  ["read", "intent"],
  ["accepted", "intent"],
  ["anticipation", "telegraph"],
  ["release", "cast"],
  ["payoff", "impact"],
])

const TELEGRAPH_KINDS = new Set([
  "zeus_strike_warning", "tower_telegraph", "needle_root_telegraph", "mandy_super_charge", "kaze_dash_telegraph", "mico_vortex_telegraph",
  "ash_hound_charge_telegraph", "root_guardian_telegraph",
])
const ACTIVE_KINDS = new Set([
  "zeus_beam_hole", "zeus_storm_target", "zeus_thunderbrand",
  "lumi_roots", "lumi_flower", "needle_root_cast", "needle_root_active", "needle_moisture_reserve", "needle_spore_cloud",
  "katty_paint_cloud", "katty_paint_puddle", "katty_paint_trail",
  "mina_healing_aura", "kaze_veil_step", "kaze_followup_ready",
  "mico_staff_spin", "mico_ruyi_bind", "mico_suppressed_rage", "mandy_stance",
  "vortex", "vine", "spin", "zeus_fire_ground", "needle_spores",
  "mandy_super_wave", "root_guardian_zone",
])
const IMPACT_KINDS = new Set([
  "mina_mark_burst", "mina_mark_break", "needle_root_burst", "needle_root_pull", "needle_anti_heal", "needle_spore_stun",
  "katty_paint_impact", "katty_paint_stick", "lumi_root_impact", "lumi_seedburst",
  "lightning", "zeus_lightning_strike", "zeus_lightning_blast", "mico_skyfall", "mico_armor_burst", "burst", "evade", "damage", "crate_hit", "crate_break", "rock",
  "mina_air_wave", "wall_break", "objective_hit", "tower_shot_blocked", "collapse", "kaze_cross_slash",
  "ash_hound_charge_impact", "root_guardian_impact",
])
const RECOVERY_KINDS = new Set(["ash_hound_recovery", "root_guardian_recovery"])

const FALLBACK_PHASES = new Map([
  ...[...RECOVERY_KINDS].map(kind => [kind, "recovery"]),
  ...[...TELEGRAPH_KINDS].map(kind => [kind, "telegraph"]),
  ...[...ACTIVE_KINDS].map(kind => [kind, "active"]),
  ...[...IMPACT_KINDS].map(kind => [kind, "impact"]),
])

export const getCombatEffectPhase = effect => {
  const raw = String(effect?.phase || "").trim().toLowerCase()
  const authoritative = PHASE_ALIASES.get(raw) || raw
  if (PHASES.has(authoritative)) return authoritative
  return FALLBACK_PHASES.get(String(effect?.kind || "")) || "cast"
}

export const getCombatEffectPhaseLabel = effect => ({
  intent: "НАМЕРЕНИЕ",
  cast: "ЗАМАХ",
  telegraph: "ТЕЛЕГРАФ",
  active: "ЗОНА",
  impact: "УДАР",
  status: "СТАТУС",
  recovery: "ВОССТАНОВЛЕНИЕ",
}[getCombatEffectPhase(effect)])
