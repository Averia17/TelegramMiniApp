package player

import "testing"

func TestApplyHealthBoostUsesOriginalMaxLivesAndStacks(t *testing.T) {
	p := &Player{Lives: 300, MaxLives: 600}

	if got := p.ApplyHealthBoost(.05); got != 30 {
		t.Fatalf("first health boost = %d, want 30", got)
	}
	if p.MaxLives != 630 || p.Lives != 330 {
		t.Fatalf("after first health boost lives=%d/%d, want 330/630", p.Lives, p.MaxLives)
	}

	if got := p.ApplyHealthBoost(.05); got != 30 {
		t.Fatalf("second health boost = %d, want 30 from original max lives", got)
	}
	if p.MaxLives != 660 || p.Lives != 360 {
		t.Fatalf("after second health boost lives=%d/%d, want 360/660", p.Lives, p.MaxLives)
	}
}
