package game

type CombatEffectPhase string

const (
	EffectPhaseCast      CombatEffectPhase = "cast"
	EffectPhaseTelegraph CombatEffectPhase = "telegraph"
	EffectPhaseActive    CombatEffectPhase = "active"
	EffectPhaseImpact    CombatEffectPhase = "impact"
)

var telegraphEffectKinds = map[string]struct{}{
	"zeus_strike_warning": {},
	"tower_telegraph":     {},
}

var activeEffectKinds = map[string]struct{}{
	"zeus_beam_hole":          {},
	"zeus_storm_target":       {},
	"zeus_thunderbrand":       {},
	"lumi_roots":              {},
	"lumi_flower":             {},
	"needle_root_cast":        {},
	"needle_moisture_reserve": {},
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
}

var impactEffectKinds = map[string]struct{}{
	"mina_mark_burst":    {},
	"mina_mark_break":    {},
	"needle_root_burst":  {},
	"katty_paint_impact": {},
	"katty_paint_stick":  {},
	"lumi_seedburst":     {},
	"wall_break":         {},
	"objective_hit":      {},
	"tower_shot_blocked": {},
	"collapse":           {},
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
