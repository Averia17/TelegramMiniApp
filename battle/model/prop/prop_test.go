package prop

import "testing"

func TestNewProp(t *testing.T) {
	p := NewProp("potion-red", 100, 200, 12)

	if p.Type != "potion-red" {
		t.Errorf("Type = %v, want potion-red", p.Type)
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
	p := NewProp("potion-red", 0, 0, 12)
	p.Active = false
	if p.Active {
		t.Error("deactivated prop should not be active")
	}
}
