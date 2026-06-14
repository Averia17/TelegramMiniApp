package player

import (
	"battle/service/geometry"
	"testing"
)

func newTestPlayer(id, name string, x, y, radius float64, maxLives int, team string) *Player {
	p := &Player{
		CircleBody: geometry.CircleBody{X: x, Y: y, Radius: radius},
		PlayerId:   id,
		Name:       name,
		MaxLives:   maxLives,
		Lives:      maxLives,
		Color:      "#FFFFFF",
	}
	if team != "" {
		p.SetTeam(team)
	}
	return p
}

func TestNewPlayer(t *testing.T) {
	p := newTestPlayer("p1", "Alice", 100, 200, 16, 3, "")

	if p.PlayerId != "p1" {
		t.Errorf("PlayerId = %v, want p1", p.PlayerId)
	}
	if p.Name != "Alice" {
		t.Errorf("Name = %v, want Alice", p.Name)
	}
	if p.X != 100 || p.Y != 200 {
		t.Errorf("Position = (%v,%v), want (100,200)", p.X, p.Y)
	}
	if p.Radius != 16 {
		t.Errorf("Radius = %v, want 16", p.Radius)
	}
	if p.Lives != 3 || p.MaxLives != 3 {
		t.Errorf("Lives = %v/%v, want 3/3", p.Lives, p.MaxLives)
	}
	if p.Color != "#FFFFFF" {
		t.Errorf("Color = %v, want #FFFFFF (no team)", p.Color)
	}
}

func TestNewPlayerWithTeam(t *testing.T) {
	p := newTestPlayer("p1", "Bob", 0, 0, 16, 3, "Red")
	if p.Color != "#FF0000" {
		t.Errorf("Red team color = %v, want #FF0000", p.Color)
	}

	p2 := newTestPlayer("p2", "Eve", 0, 0, 16, 3, "Blue")
	if p2.Color != "#0000FF" {
		t.Errorf("Blue team color = %v, want #0000FF", p2.Color)
	}
}

func TestPlayerMove(t *testing.T) {
	p := newTestPlayer("p1", "Test", 100, 100, 16, 3, "")
	p.Move(1, 0, 1)
	if p.X <= 100 {
		t.Errorf("Move right: X = %v, should be > 100", p.X)
	}

	p2 := newTestPlayer("p2", "Test", 100, 100, 16, 3, "")
	p2.Move(0, -1, 1)
	if p2.Y >= 100 {
		t.Errorf("Move up: Y = %v, should be < 100", p2.Y)
	}
}

func TestPlayerMoveZeroDirection(t *testing.T) {
	p := newTestPlayer("p1", "Test", 100, 100, 16, 3, "")
	p.Move(0, 0, 1)
	if p.X != 100 || p.Y != 100 {
		t.Errorf("Move(0,0) changed position to (%v,%v)", p.X, p.Y)
	}
}

func TestPlayerHurtHeal(t *testing.T) {
	p := newTestPlayer("p1", "Test", 0, 0, 16, 3, "")

	p.Hurt()
	if p.Lives != 2 {
		t.Errorf("After Hurt: Lives = %v, want 2", p.Lives)
	}

	p.Heal()
	if p.Lives != 3 {
		t.Errorf("After Heal: Lives = %v, want 3", p.Lives)
	}
}

func TestPlayerIsAlive(t *testing.T) {
	p := newTestPlayer("p1", "Test", 0, 0, 16, 3, "")
	if !p.IsAlive() {
		t.Error("new player should be alive")
	}

	p.Lives = 0
	if p.IsAlive() {
		t.Error("player with 0 lives should not be alive")
	}

	p.Lives = 1
	if !p.IsAlive() {
		t.Error("player with 1 life should be alive")
	}
}

func TestPlayerIsFullLives(t *testing.T) {
	p := newTestPlayer("p1", "Test", 0, 0, 16, 3, "")
	if !p.IsFullLives() {
		t.Error("new player should be full lives")
	}

	p.Lives = 2
	if p.IsFullLives() {
		t.Error("player with 2/3 lives should not be full")
	}
}

func TestPlayerCanBulletHurt(t *testing.T) {
	p := newTestPlayer("p1", "Test", 0, 0, 16, 3, "")

	if p.CanBulletHurt("p1", "") {
		t.Error("should not hurt self")
	}

	if !p.CanBulletHurt("p2", "") {
		t.Error("should hurt different player")
	}

	p.Lives = 0
	if p.CanBulletHurt("p2", "") {
		t.Error("dead player should not be hurtable")
	}

	p.Lives = 3
	p.Team = "Red"
	if p.CanBulletHurt("p2", "Red") {
		t.Error("should not hurt same team")
	}
	if !p.CanBulletHurt("p2", "Blue") {
		t.Error("should hurt different team")
	}
}

func TestPlayerSetTeam(t *testing.T) {
	p := newTestPlayer("p1", "Test", 0, 0, 16, 3, "")

	p.SetTeam("Red")
	if p.Team != "Red" || p.Color != "#FF0000" {
		t.Errorf("SetTeam(Red): team=%v color=%v", p.Team, p.Color)
	}

	p.SetTeam("Blue")
	if p.Team != "Blue" || p.Color != "#0000FF" {
		t.Errorf("SetTeam(Blue): team=%v color=%v", p.Team, p.Color)
	}
}

func TestGetTeamColor(t *testing.T) {
	if GetTeamColor("Red") != "#FF0000" {
		t.Error("Red should be #FF0000")
	}
	if GetTeamColor("Blue") != "#0000FF" {
		t.Error("Blue should be #0000FF")
	}
	if GetTeamColor("Unknown") != "#FF0000" {
		t.Error("Unknown team should default to #FF0000")
	}
}
