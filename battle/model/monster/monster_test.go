package monster

import (
	"battle/model/player"
	"battle/service/geometry"
	"testing"
)

func TestMonsterCombatBalanceKeepsFightsShortAndSurvivable(t *testing.T) {
	if MonsterLives != 260 || EliteMonsterLives != 380 {
		t.Fatalf("monster health: normal=%d elite=%d, want 260/380", MonsterLives, EliteMonsterLives)
	}
	if MonsterAttackDamage != 25 {
		t.Fatalf("monster attack damage = %d, want 25", MonsterAttackDamage)
	}
}

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

func TestNewMonsterOfKindKeepsAuthoredCampIdentity(t *testing.T) {
	m := NewMonsterOfKindAt(10_000, MonsterAshHound, "camp-ash-01", 120, 240, 18, 1024, 768, 320, MonsterLives)
	if m.Kind != MonsterAshHound || m.CampID != "camp-ash-01" {
		t.Fatalf("monster identity=%q/%q, want %q/camp-ash-01", m.Kind, m.CampID, MonsterAshHound)
	}
	if m.TerritoryRadius != 320 {
		t.Fatalf("monster territory=%.0f, want 320", m.TerritoryRadius)
	}
}

func TestNeutralKindsHaveDistinctAttackProfiles(t *testing.T) {
	bat := ProfileForKind(MonsterBat, 1)
	hound := ProfileForKind(MonsterAshHound, 1)
	guardian := ProfileForKind(MonsterRootGuardian, 1)

	if bat.Telegraph == hound.Telegraph || bat.Telegraph == guardian.Telegraph || hound.Telegraph == guardian.Telegraph {
		t.Fatalf("neutral telegraphs must be distinct: bat=%q hound=%q guardian=%q", bat.Telegraph, hound.Telegraph, guardian.Telegraph)
	}
	if hound.Range <= bat.Range || guardian.Range <= bat.Range {
		t.Fatalf("specialists need authored ranges: bat=%.1f hound=%.1f guardian=%.1f", bat.Range, hound.Range, guardian.Range)
	}
	if hound.RecoveryMs <= 0 {
		t.Fatal("ash hound must expose a punishable recovery window")
	}
	if guardian.RecoveryMs <= 0 {
		t.Fatal("root guardian must expose a punishable recovery window")
	}
	if guardian.WindupMs <= hound.WindupMs {
		t.Fatalf("root guardian should give a longer readable zone telegraph: guardian=%d hound=%d", guardian.WindupMs, hound.WindupMs)
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
	p := &player.Player{
		CircleBody: geometry.CircleBody{X: 150, Y: 100, Radius: 16},
		PlayerId:   "p1",
		Name:       "Test",
		MaxLives:   3,
		Lives:      3,
	}

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
	p := &player.Player{
		CircleBody: geometry.CircleBody{X: 500, Y: 500, Radius: 16},
		PlayerId:   "p1",
		Name:       "Test",
		MaxLives:   3,
		Lives:      3,
	}

	players := map[string]*player.Player{"p1": p}
	m.Update(players)

	// Monster should stay idle since player is too far
	if m.State == MonsterChase {
		t.Error("monster should not chase player beyond sight range")
	}
}

func TestMonsterStopsChasingBeyondItsLeashAndDoesNotImmediatelyReacquire(t *testing.T) {
	m := NewMonster(100, 100, 16, 1024, 1024, 3)
	p := &player.Player{
		CircleBody: geometry.CircleBody{X: 150, Y: 100, Radius: 16},
		PlayerId:   "p1",
		MaxLives:   3,
		Lives:      3,
	}
	players := map[string]*player.Player{"p1": p}

	m.Update(players)
	m.X = 100 + MonsterChaseLeash + 1
	p.X = m.X + 50
	m.Update(players)

	if m.State != MonsterIdle || m.TargetPlayerId != "" {
		t.Fatalf("monster beyond chase leash kept pursuing: state=%v target=%q", m.State, m.TargetPlayerId)
	}
	m.Update(players)
	if m.State == MonsterChase {
		t.Fatal("monster immediately reacquired the escaped player after losing the trail")
	}
}

func TestMonsterReturnsToSpawnAfterLeavingItsLeash(t *testing.T) {
	m := NewMonster(100, 100, 16, 1024, 1024, 3)
	p := &player.Player{CircleBody: geometry.CircleBody{X: 150, Y: 100, Radius: 16}, PlayerId: "p1", MaxLives: 3, Lives: 3}
	players := map[string]*player.Player{"p1": p}

	m.Update(players)
	m.X = m.SpawnX + MonsterChaseLeash + 1
	p.X = m.X + 20
	m.Update(players)
	if !m.ReturningHome || m.TargetPlayerId != "" {
		t.Fatalf("monster did not enter return-home state: returning=%v target=%q", m.ReturningHome, m.TargetPlayerId)
	}

	before := m.X
	m.Update(players)
	if m.X >= before {
		t.Fatalf("monster did not move back toward spawn: before=%.1f after=%.1f spawn=%.1f", before, m.X, m.SpawnX)
	}
}

func TestMonsterCoastsBrieflyWhenItsTargetDisappears(t *testing.T) {
	m := NewMonster(100, 100, 16, 1024, 1024, 3)
	m.State = MonsterChase
	m.TargetPlayerId = "p1"
	m.MoveX, m.MoveY, m.MoveScale = 1, 0, 1
	m.X = 180
	p := &player.Player{CircleBody: geometry.CircleBody{X: 200, Y: 100, Radius: 16}, PlayerId: "p1", MaxLives: 3, Lives: 0}

	before := m.X
	m.Update(map[string]*player.Player{"p1": p})

	if !m.ReturningHome || m.X <= before {
		t.Fatalf("monster stopped or reversed instantly after losing target: returning=%v before=%.2f after=%.2f", m.ReturningHome, before, m.X)
	}
}

func TestMonsterChaseDeadPlayer(t *testing.T) {
	m := NewMonster(100, 100, 16, 512, 512, 3)
	m.State = MonsterChase
	m.TargetPlayerId = "p1"

	p := &player.Player{
		CircleBody: geometry.CircleBody{X: 110, Y: 100, Radius: 16},
		PlayerId:   "p1",
		Name:       "Test",
		MaxLives:   3,
		Lives:      0,
	}

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
