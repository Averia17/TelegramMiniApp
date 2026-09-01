package game

type CombatEffectPhase string

const (
	EffectPhaseCast      CombatEffectPhase = "cast"
	EffectPhaseTelegraph CombatEffectPhase = "telegraph"
	EffectPhaseActive    CombatEffectPhase = "active"
	EffectPhaseImpact    CombatEffectPhase = "impact"
)

var telegraphEffectKinds = map[string]struct{}{
	"zeus_strike_warning":        {},
	"tower_telegraph":            {},
	"needle_root_telegraph":      {},
	"mandy_super_charge":         {},
	"kaze_dash_telegraph":        {},
	"mico_vortex_telegraph":      {},
	"ash_hound_charge_telegraph": {},
	"root_guardian_telegraph":    {},
}

var activeEffectKinds = map[string]struct{}{
	"zeus_beam_hole":          {},
	"zeus_storm_target":       {},
	"zeus_thunderbrand":       {},
	"lumi_roots":              {},
	"lumi_flower":             {},
	"needle_root_cast":        {},
	"needle_root_active":      {},
	"needle_moisture_reserve": {},
	"needle_spore_cloud":      {},
	"needle_spores":           {},
	"katty_paint_cloud":       {},
	"katty_paint_puddle":      {},
	"katty_paint_trail":       {},
	"mina_healing_aura":       {},
	"kaze_veil_step":          {},
	"kaze_followup_ready":     {},
	"mico_staff_spin":         {},
	"mico_ruyi_bind":          {},
	"mico_suppressed_rage":    {},
	"mandy_stance":            {},
	"zeus_fire_ground":        {},
	"vortex":                  {},
	"vine":                    {},
	"spin":                    {},
	"mandy_super_wave":        {},
	"root_guardian_zone":      {},
}

var impactEffectKinds = map[string]struct{}{
	"mina_mark_burst":         {},
	"mina_mark_break":         {},
	"needle_root_burst":       {},
	"needle_root_pull":        {},
	"needle_anti_heal":        {},
	"needle_spore_stun":       {},
	"katty_paint_impact":      {},
	"katty_paint_stick":       {},
	"lumi_root_impact":        {},
	"lumi_seedburst":          {},
	"lightning":               {},
	"zeus_lightning_strike":   {},
	"zeus_lightning_blast":    {},
	"mico_skyfall":            {},
	"mico_armor_burst":        {},
	"burst":                   {},
	"evade":                   {},
	"damage":                  {},
	"crate_hit":               {},
	"crate_break":             {},
	"rock":                    {},
	"kaze_dash":               {},
	"mina_air_wave":           {},
	"wall_break":              {},
	"objective_hit":           {},
	"tower_shot_blocked":      {},
	"collapse":                {},
	"kaze_cross_slash":        {},
	"ash_hound_charge_impact": {},
	"ash_hound_recovery":      {},
	"root_guardian_impact":    {},
}

func combatEffectPhase(kind string) CombatEffectPhase {
	if _, ok := telegraphEffectKinds[kind]; ok {
		return EffectPhaseTelegraph
	}
	if _, ok := activeEffectKinds[kind]; ok {
		return EffectPhaseActive
	}
	if _, ok := impactEffectKinds[kind]; ok {
		return EffectPhaseImpact
	}
	return EffectPhaseCast
}
