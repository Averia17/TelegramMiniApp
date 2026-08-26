package prop

import "testing"

func TestNewProp(t *testing.T) {
	p := NewProp("health_boost", 100, 200, 12)

	if p.Type != "health_boost" {
		t.Errorf("Type = %v, want health_boost", p.Type)
	}
	if p.X != 100 || p.Y != 200 {
		t.Errorf("Position = (%v,%v), want (100,200)", p.X, p.Y)
	}
	if p.Radius != 12 {
		t.Errorf("Radius = %v, want 12", p.Radius)
	}
	if !p.Active {
		t.Error("new prop should be active")
	}
}

func TestPropDeactivate(t *testing.T) {
	p := NewProp("health_boost", 0, 0, 12)
	p.Active = false
	if p.Active {
		t.Error("deactivated prop should not be active")
	}
}

func TestNewLunarCrate(t *testing.T) {
	p := NewLunarCrate(100, 200, "speed")

	if p.Type != "lunar_crate" || p.LootType != "speed" {
		t.Fatalf("crate identity = (%q, %q), want lunar_crate/speed", p.Type, p.LootType)
	}
	if p.Lives != LunarCrateLives || p.MaxLives != LunarCrateLives {
		t.Fatalf("crate health = %d/%d, want %d/%d", p.Lives, p.MaxLives, LunarCrateLives, LunarCrateLives)
	}
	if !p.Active {
		t.Fatal("new lunar crate should be active")
	}
}
