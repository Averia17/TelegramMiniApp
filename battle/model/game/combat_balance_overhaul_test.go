package game

import (
	"math"
	"testing"
	"time"
)

func TestCombatBalanceMatrixCoversEveryActiveHero(t *testing.T) {
	matrix := BuildCombatBalanceMatrix()
	if len(matrix) != len(Heroes) {
		t.Fatalf("balance matrix has %d rows, want %d", len(matrix), len(Heroes))
	}
	seen := make(map[string]bool, len(matrix))
	for _, row := range matrix {
		if row.Hero == "" || row.Role == "" || row.BasicBurst <= 0 || row.BasicDPS <= 0 {
			t.Fatalf("invalid balance row: %#v", row)
		}
		if seen[row.Hero] {
			t.Fatalf("duplicate balance row for %q", row.Hero)
		}
		seen[row.Hero] = true
	}
}

func TestFirstParitySliceMovesKazePowerFromCadenceToReadablePayoff(t *testing.T) {
	kaze := GetHeroByName("Kaze")
	if kaze == nil {
		t.Fatal("missing Kaze")
	}
	if kaze.AttackRate < 260 {
		t.Fatalf("Kaze attack cadence=%dms, want a punishable cadence >=260ms", kaze.AttackRate)
	}
	if KazeEmpoweredDamageMultiplier > 1.55 {
		t.Fatalf("Kaze finisher multiplier=%.2f, want <=1.55", KazeEmpoweredDamageMultiplier)
	}
}

func TestFirstParitySliceGivesKattyAVisiblePaintPayoff(t *testing.T) {
	katty := GetHeroByName("Katty")
	if katty == nil {
		t.Fatal("missing Katty")
	}
	if katty.AttackDamage < 50 {
		t.Fatalf("Katty direct damage=%d, want >=50 for a fair short-range trade", katty.AttackDamage)
	}
	if KattyPaintBonusMultiplier < .4 {
		t.Fatalf("Katty paint bonus=%.2f, want >=0.40 on the visible third-stack payoff", KattyPaintBonusMultiplier)
	}
}

func TestKattyPaintStacksExposeTheStrongestActiveSetup(t *testing.T) {
	gs := newTestGameState()
	gs.KattyPaintStacks = map[string]map[string]int{
		"katty-a": {"target": 1},
		"katty-b": {"target": 2},
	}
	if got := gs.KattyPaintStacksFor("target"); got != 2 {
		t.Fatalf("paint stacks=%d, want the strongest active setup", got)
	}
}

func TestMandyFocusAndGadgetUseAnAdditiveDamageBudget(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("mandy", "Mandy", "Mandy")
	gs.PlayerAdd("target", "Target", "Needle")
	source, target := gs.Players["mandy"], gs.Players["target"]
	source.X, source.Y = 500, 500
	target.X, target.Y = 570, 500
	source.FocusCharge = 100
	source.GadgetArmed = true

	MandyKit{}.Basic(gs, source, time.Now().UnixMilli(), 0, 0)
	want := int(math.Round(float64(source.AttackDmg) * MandyMaxBasicDamageMultiplier))
	if dealt := target.MaxLives - target.Lives; dealt != want {
		t.Fatalf("stacked Mandy strike dealt %d, want additive budget %d", dealt, want)
	}
}

func TestNeedleRootPublishesAReadableBindWindow(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("needle", "Needle", "Needle")
	gs.PlayerAdd("target", "Target", "Mandy")
	needle, target := gs.Players["needle"], gs.Players["target"]
	needle.X, needle.Y = 500, 500
	target.X, target.Y = 600, 500

	NeedleKit{}.Super(gs, needle, time.Now().UnixMilli(), 0, 100)
	gs.HeroZones[0].TriggerAt = time.Now().UnixMilli() - 1
	gs.updateNewHeroSystems()

	if target.SlowUntil <= time.Now().UnixMilli() || target.SlowMultiplier >= .5 {
		t.Fatalf("needle root slow until=%d multiplier=%.2f, want a visible slow window", target.SlowUntil, target.SlowMultiplier)
	}
}

func TestLumiFlowersTrackSetupAndAreConsumedByGadget(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("lumi", "Lumi", "Persephone Lumi")
	lumi := gs.Players["lumi"]
	now := time.Now().UnixMilli()

	PersephoneLumiKit{}.Basic(gs, lumi, now, 0, 0)
	PersephoneLumiKit{}.Basic(gs, lumi, now+1, 0, 0)
	for _, shot := range gs.Bullets {
		shot.X, shot.Y = lumi.X+520, lumi.Y
		gs.finishNewHeroProjectile(shot)
	}
	if lumi.LumiFlowers != 2 {
		t.Fatalf("Lumi flowers=%d after two basics, want 2", lumi.LumiFlowers)
	}
	if !gs.useNewHeroGadget(lumi, now+2) {
		t.Fatal("Lumi flower gadget was rejected")
	}
	if lumi.LumiFlowers != 0 {
		t.Fatalf("Lumi flowers=%d after detonation, want 0", lumi.LumiFlowers)
	}
}

func TestCombatEffectPhaseContract(t *testing.T) {
	cases := map[string]CombatEffectPhase{
		"lumi_roots":            EffectPhaseActive,
		"lumi_seedburst":        EffectPhaseImpact,
		"zeus_strike_warning":   EffectPhaseTelegraph,
		"katty_paint_spray":     EffectPhaseCast,
		"needle_spores":         EffectPhaseActive,
		"mandy_super_wave":      EffectPhaseActive,
		"lightning":             EffectPhaseImpact,
		"zeus_lightning_strike": EffectPhaseImpact,
		"zeus_lightning_blast":  EffectPhaseImpact,
		"mico_skyfall":          EffectPhaseImpact,
		"burst":                 EffectPhaseImpact,
		"evade":                 EffectPhaseImpact,
		"damage":                EffectPhaseImpact,
		"crate_hit":             EffectPhaseImpact,
		"crate_break":           EffectPhaseImpact,
		"rock":                  EffectPhaseImpact,
		"mina_air_wave":         EffectPhaseImpact,
		"wall_break":            EffectPhaseImpact,
		"kaze_cross_slash":      EffectPhaseImpact,
	}
	for kind, want := range cases {
		if got := combatEffectPhase(kind); got != want {
			t.Errorf("%s phase=%q, want %q", kind, got, want)
		}
	}
}
