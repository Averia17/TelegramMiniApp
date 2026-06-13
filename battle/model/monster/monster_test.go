package monster

import (
	"battle/model/player"
	"battle/service/geometry"
	"testing"
)

func TestNewMonster(t *testing.T) {
	m := NewMonster(100, 200, 16, 512, 512, 3)

	if m.X != 100 || m.Y != 200 {
		t.Errorf("Position = (%v,%v), want (100,200)", m.X, m.Y)
	}
	if m.Radius != 16 {
		t.Errorf("Radius = %v, want 16", m.Radius)
	}
	if !m.IsAlive() {
		t.Error("new monster should be alive")
	}
	if m.State != MonsterIdle {
		t.Errorf("initial state = %v, want idle", m.State)
	}
}

func TestMonsterHurt(t *testing.T) {
	m := NewMonster(0, 0, 16, 512, 512, 3)

	m.Hurt()
	if !m.IsAlive() {
		t.Error("monster with 2 lives should be alive")
	}

	m.Hurt()
	if !m.IsAlive() {
		t.Error("monster with 1 life should be alive")
	}

	m.Hurt()
	if m.IsAlive() {
		t.Error("monster with 0 lives should be dead")
	}
}

func TestMonsterCanAttack(t *testing.T) {
	m := NewMonster(0, 0, 16, 512, 512, 3)

	// Not in chase state
	if m.CanAttack() {
		t.Error("idle monster should not be able to attack")
	}

	// Set to chase state
	m.State = MonsterChase
	m.LastAttackAt = 0 // long time ago
	if !m.CanAttack() {
		t.Error("chase monster with old attack should be able to attack")
	}

	// Recent attack
	m.LastAttackAt = NowMillis()
	if m.CanAttack() {
		t.Error("chase monster with recent attack should not be able to attack")
	}
}

func TestMonsterAttack(t *testing.T) {
	m := NewMonster(0, 0, 16, 512, 512, 3)
	m.LastAttackAt = 0
	m.Attack()
	if m.LastAttackAt == 0 {
		t.Error("Attack() should update LastAttackAt from 0")
	}
}

func TestMonsterChasePlayer(t *testing.T) {
	m := NewMonster(100, 100, 16, 512, 512, 3)
	p := player.NewPlayer("p1", "Test", 150, 100, 16, 3, "")

	players := map[string]*player.Player{"p1": p}
	m.Update(players)

	if m.State != MonsterChase {
		t.Errorf("state = %v, want chase (player in sight)", m.State)
	}
	if m.TargetPlayerId != "p1" {
		t.Errorf("TargetPlayerId = %v, want p1", m.TargetPlayerId)
	}
}

func TestMonsterChaseTooFar(t *testing.T) {
	m := NewMonster(0, 0, 16, 512, 512, 3)
	p := player.NewPlayer("p1", "Test", 500, 500, 16, 3, "")

	players := map[string]*player.Player{"p1": p}
	m.Update(players)

	// Monster should stay idle since player is too far
	if m.State == MonsterChase {
		t.Error("monster should not chase player beyond sight range")
	}
}

func TestMonsterChaseDeadPlayer(t *testing.T) {
	m := NewMonster(100, 100, 16, 512, 512, 3)
	m.State = MonsterChase
	m.TargetPlayerId = "p1"

	p := player.NewPlayer("p1", "Test", 110, 100, 16, 3, "")
	p.Lives = 0

	players := map[string]*player.Player{"p1": p}
	m.Update(players)

	if m.State != MonsterIdle {
		t.Errorf("state = %v, want idle (target dead)", m.State)
	}
}

func TestMonsterPatrol(t *testing.T) {
	m := NewMonster(200, 200, 16, 512, 512, 3)
	m.State = MonsterPatrol
	m.PatrolDuration = 999999 // won't timeout
	m.LastActionAt = NowMillis()
	m.Rotation = 0

	players := map[string]*player.Player{}
	beforeX := m.X
	m.Update(players)

	if m.X == beforeX {
		t.Error("monster should move during patrol")
	}
}

func TestMonsterPatrolBoundary(t *testing.T) {
	m := NewMonster(5, 200, 16, 512, 512, 3)
	m.State = MonsterPatrol
	m.PatrolDuration = 999999
	m.LastActionAt = NowMillis()
	m.Rotation = 3.14 // moving left

	players := map[string]*player.Player{}
	m.Update(players)

	// Should be clamped
	if m.X < 0 {
		t.Errorf("monster X = %v, should be >= 0", m.X)
	}
}

func TestMonsterIdleToPatrol(t *testing.T) {
	m := NewMonster(200, 200, 16, 512, 512, 3)
	m.State = MonsterIdle
	m.IdleDuration = 1 // very short
	m.LastActionAt = 0 // long ago

	players := map[string]*player.Player{}
	m.Update(players)

	if m.State != MonsterPatrol {
		t.Errorf("state = %v, want patrol after idle timeout", m.State)
	}
}

func TestGetClosestPlayerId(t *testing.T) {
	players := map[string]*player.Player{
		"p1": {CircleBody: geometry.CircleBody{X: 100, Y: 100}, Lives: 3},
		"p2": {CircleBody: geometry.CircleBody{X: 500, Y: 500}, Lives: 3},
	}

	id := GetClosestPlayerId(110, 110, players)
	if id != "p1" {
		t.Errorf("closest player = %v, want p1", id)
	}
}

func TestGetClosestPlayerIdDeadPlayers(t *testing.T) {
	players := map[string]*player.Player{
		"p1": {CircleBody: geometry.CircleBody{X: 100, Y: 100}, Lives: 0},
		"p2": {CircleBody: geometry.CircleBody{X: 500, Y: 500}, Lives: 3},
	}

	id := GetClosestPlayerId(100, 100, players)
	if id != "" {
		t.Errorf("closest player = %v, want empty (all dead/too far)", id)
	}
}
