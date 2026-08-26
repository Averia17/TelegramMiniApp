package player

import "testing"

func TestApplyHealthBoostUsesOriginalMaxLivesAndStacks(t *testing.T) {
	p := &Player{Lives: 300, MaxLives: 600}

	if got := p.ApplyHealthBoost(.05); got != 30 {
		t.Fatalf("first health boost = %d, want 30", got)
	}
	if p.MaxLives != 630 || p.Lives != 300 {
		t.Fatalf("after first health boost lives=%d/%d, want 300/630", p.Lives, p.MaxLives)
	}

	if got := p.ApplyHealthBoost(.05); got != 30 {
		t.Fatalf("second health boost = %d, want 30 from original max lives", got)
	}
	if p.MaxLives != 660 || p.Lives != 300 {
		t.Fatalf("after second health boost lives=%d/%d, want 300/660", p.Lives, p.MaxLives)
	}
}

func TestApplyHealthBoostStopsAtFiveStacks(t *testing.T) {
	p := &Player{Lives: 600, MaxLives: 600, HealthBoosts: 5}

	if got := p.ApplyHealthBoost(.05); got != 0 {
		t.Fatalf("sixth health boost = %d, want 0", got)
	}
	if p.MaxLives != 600 || p.Lives != 600 || p.HealthBoosts != 5 {
		t.Fatalf("health state after capped boost = lives=%d/%d stacks=%d", p.Lives, p.MaxLives, p.HealthBoosts)
	}
}

func TestTakeDamageAtUsesAuthoritativeTimestamp(t *testing.T) {
	p := &Player{Lives: 100, MaxLives: 100}
	p.TakeDamageAt(10, 1234)
	if p.Lives != 90 || p.LastDamageAt != 1234 {
		t.Fatalf("damage state = lives=%d lastDamageAt=%d, want 90/1234", p.Lives, p.LastDamageAt)
	}
}
