package bullet

import (
	"math"
	"testing"
)

func TestNewBullet(t *testing.T) {
	b := NewBullet("p1", "Red", 100, 200, 4, 1.5, "#FF0000", 12345)

	if b.PlayerId != "p1" {
		t.Errorf("PlayerId = %v, want p1", b.PlayerId)
	}
	if b.Team != "Red" {
		t.Errorf("Team = %v, want Red", b.Team)
	}
	if b.X != 100 || b.Y != 200 {
		t.Errorf("Position = (%v,%v), want (100,200)", b.X, b.Y)
	}
	if b.Radius != 4 {
		t.Errorf("Radius = %v, want 4", b.Radius)
	}
	if b.Rotation != 1.5 {
		t.Errorf("Rotation = %v, want 1.5", b.Rotation)
	}
	if !b.Active {
		t.Error("new bullet should be active")
	}
	if b.Color != "#FF0000" {
		t.Errorf("Color = %v, want #FF0000", b.Color)
	}
	if b.ShotAt != 12345 {
		t.Errorf("ShotAt = %v, want 12345", b.ShotAt)
	}
	if b.FromX != 100 || b.FromY != 200 {
		t.Errorf("From = (%v,%v), want (100,200)", b.FromX, b.FromY)
	}
}

func TestBulletMove(t *testing.T) {
	b := NewBullet("p1", "", 100, 100, 4, 0, "#FFF", 0)

	b.Move(10)
	if b.X <= 100 {
		t.Errorf("Move(10) right: X = %v, should be > 100", b.X)
	}

	b2 := NewBullet("p1", "", 100, 100, 4, math.Pi/2, "#FFF", 0)
	b2.Move(10)
	if b2.Y <= 100 {
		t.Errorf("Move(10) down: Y = %v, should be > 100", b2.Y)
	}
}

func TestBulletReset(t *testing.T) {
	b := NewBullet("p1", "Red", 100, 100, 4, 0, "#FF0000", 1000)
	b.Active = false

	b.Reset("p2", "Blue", 200, 200, 6, 1.5, "#0000FF", 2000)

	if b.PlayerId != "p2" {
		t.Errorf("After Reset: PlayerId = %v, want p2", b.PlayerId)
	}
	if b.Team != "Blue" {
		t.Errorf("After Reset: Team = %v, want Blue", b.Team)
	}
	if b.X != 200 || b.Y != 200 {
		t.Errorf("After Reset: Position = (%v,%v), want (200,200)", b.X, b.Y)
	}
	if b.Radius != 6 {
		t.Errorf("After Reset: Radius = %v, want 6", b.Radius)
	}
	if !b.Active {
		t.Error("After Reset: Active should be true")
	}
	if b.Color != "#0000FF" {
		t.Errorf("After Reset: Color = %v, want #0000FF", b.Color)
	}
	if b.FromX != 200 || b.FromY != 200 {
		t.Errorf("After Reset: From = (%v,%v), want (200,200)", b.FromX, b.FromY)
	}
}
