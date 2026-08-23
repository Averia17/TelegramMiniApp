package game

import (
	"math"
	"testing"
	"time"
)

func TestMeleeHeroesTradeReachForTheStrongestBasicHits(t *testing.T) {
	maxRangedDamage := 0
	for _, hero := range Heroes {
		if hero.Attack.Archetype != AttackMeleeCone && hero.AttackDamage > maxRangedDamage {
			maxRangedDamage = hero.AttackDamage
		}
	}
	for _, hero := range Heroes {
		if hero.Attack.Archetype == AttackMeleeCone && hero.AttackDamage < maxRangedDamage {
			t.Errorf("%s melee damage = %d, want at least ranged maximum %d", hero.Name, hero.AttackDamage, maxRangedDamage)
		}
	}
}

func TestMeleeHeroesHaveEnoughMobilityAndHealthToCloseOnNeedle(t *testing.T) {
	needle := GetHeroByName("Needle")
	if needle == nil {
		t.Fatal("missing Needle")
	}

	for _, hero := range Heroes {
		if hero.Attack.Archetype != AttackMeleeCone {
			continue
		}
		if hero.Speed < needle.Speed {
			t.Errorf("%s speed = %d, want at least %d to close on Needle", hero.Name, hero.Speed, needle.Speed)
		}
		if hero.MaxLives < needle.MaxLives {
			t.Errorf("%s health = %d, want at least %d to survive the approach", hero.Name, hero.MaxLives, needle.MaxLives)
		}
	}
}

func TestMeleeAttackGeometryIsAuthoritativeAndDirectionInvariant(t *testing.T) {
	expected := map[string]float64{"Mandy": 110, "Kaze": 125, "Wukong Mico": 140}
	for _, heroName := range []string{"Mandy", "Kaze", "Wukong Mico"} {
		t.Run(heroName, func(t *testing.T) {
			config := GetAttackConfig(heroName)
			kit := CombatKitFor(heroName)
			if config.Range != expected[heroName] || config.HalfArcDegrees != 60 {
				t.Fatalf("accessible melee area = %.1f/%.1f degrees, want %.1f/60", config.Range, config.HalfArcDegrees, expected[heroName])
			}
			if kit.AttackRange() != config.Range {
				t.Fatalf("kit range %.1f differs from advertised range %.1f", kit.AttackRange(), config.Range)
			}

			for direction := 0; direction < 8; direction++ {
				gs := newTestGameState()
				gs.State = GameStateGame
				gs.PlayerAdd("source", heroName, heroName)
				gs.PlayerAdd("inside", "Inside", "Needle")
				gs.PlayerAdd("outside", "Outside", "Needle")
				source := gs.Players["source"]
				inside := gs.Players["inside"]
				outside := gs.Players["outside"]
				source.X, source.Y = 900, 900
				angle := float64(direction) * math.Pi / 4
				inside.X = source.X + math.Cos(angle)*config.Range
				inside.Y = source.Y + math.Sin(angle)*config.Range
				outside.X = source.X + math.Cos(angle)*(config.Range+inside.Radius+1)
				outside.Y = source.Y + math.Sin(angle)*(config.Range+inside.Radius+1)

				kit.Basic(gs, source, time.Now().UnixMilli(), angle, config.Range)

				if inside.Lives == inside.MaxLives {
					t.Fatalf("direction %d did not hit at the advertised radius", direction)
				}
				if outside.Lives != outside.MaxLives {
					t.Fatalf("direction %d hit beyond the advertised radius", direction)
				}
			}
		})
	}
}

func TestMeleeSupersHoldEnemiesForAFollowUpAttack(t *testing.T) {
	const minimumControlWindow = int64(900)
	now := time.Now().UnixMilli()

	t.Run("Mandy wave", func(t *testing.T) {
		gs := newTestGameState()
		gs.State = GameStateGame
		gs.PlayerAdd("source", "Mandy", "Mandy")
		gs.PlayerAdd("target", "Target", "Needle")
		source, target := gs.Players["source"], gs.Players["target"]
		source.X, source.Y, target.X, target.Y = 500, 500, 700, 500
		MandyKit{}.Super(gs, source, now, 0, 0)
		gs.PendingMandySupers[0].TriggerAt = time.Now().UnixMilli()
		gs.updatePendingMandySupers()
		if target.StunUntil < now+minimumControlWindow {
			t.Fatalf("stun until %d, want at least %d", target.StunUntil, now+minimumControlWindow)
		}
	})

	t.Run("Kaze dash", func(t *testing.T) {
		gs := newTestGameState()
		gs.State = GameStateGame
		gs.PlayerAdd("source", "Kaze", "Kaze")
		gs.PlayerAdd("target", "Target", "Needle")
		source, target := gs.Players["source"], gs.Players["target"]
		source.X, source.Y, target.X, target.Y = 500, 500, 650, 500
		KazeKit{}.Super(gs, source, now, 0, 0)
		if target.StunUntil < now+minimumControlWindow {
			t.Fatalf("stun until %d, want at least %d", target.StunUntil, now+minimumControlWindow)
		}
	})

	t.Run("Mico vortex", func(t *testing.T) {
		gs := newTestGameState()
		gs.State = GameStateGame
		gs.PlayerAdd("source", "Wukong Mico", "Wukong Mico")
		gs.PlayerAdd("target", "Target", "Needle")
		source, target := gs.Players["source"], gs.Players["target"]
		source.X, source.Y, target.X, target.Y = 500, 500, 570, 500
		WukongMicoKit{}.Super(gs, source, now, 0, 0)
		micoControlWindow := MicoVortexStunDuration.Milliseconds()
		if target.StunUntil < now+micoControlWindow {
			t.Fatalf("stun until %d, want at least %d", target.StunUntil, now+micoControlWindow)
		}
	})
}

func TestMandyStaffStrikeAlwaysCreatesAComboWindow(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("mandy", "Mandy", "Mandy")
	gs.PlayerAdd("target", "Target", "Wukong Mico")
	source, target := gs.Players["mandy"], gs.Players["target"]
	source.X, source.Y, target.X, target.Y = 500, 500, 570, 500
	now := time.Now().UnixMilli()

	MandyKit{}.Basic(gs, source, now, 0, 0)
	if target.Lives != target.MaxLives-100 {
		t.Fatalf("normal staff hit damage=%d, want 100", target.MaxLives-target.Lives)
	}
	if target.StunUntil < now+250 {
		t.Fatalf("normal staff hit stun=%d, want at least %d", target.StunUntil, now+250)
	}

	target.Lives = target.MaxLives
	source.FocusCharge = 100
	MandyKit{}.Basic(gs, source, now+1000, 0, 0)
	if target.Lives != target.MaxLives-150 {
		t.Fatalf("focused staff hit damage=%d, want 150", target.MaxLives-target.Lives)
	}
	if target.StunUntil < now+1800 {
		t.Fatalf("focused staff hit stun=%d, want at least %d", target.StunUntil, now+1800)
	}
}
