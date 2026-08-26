package game

import (
	"battle/model/gamemap"
	"battle/model/monster"
	"battle/model/player"
	"battle/service/geometry"
	"math"
	"testing"
)

func monsterHasAcquiredTarget(m *monster.Monster, playerID string) bool {
	return m != nil && m.TargetPlayerId == playerID && (m.State == monster.MonsterNotice || m.State == monster.MonsterChase)
}

func TestMonsterStopsChasingAfterItsLeash(t *testing.T) {
	gs := &GameState{
		State:    GameStateGame,
		Map:      &gamemap.GameMap{WidthInPixels: 800, HeightInPixels: 800},
		Walls:    geometry.NewSpatialHash(TileSize),
		Players:  map[string]*player.Player{},
		Monsters: map[string]*monster.Monster{},
	}
	p := &player.Player{CircleBody: geometry.CircleBody{X: 170, Y: 100, Radius: 16}, PlayerId: "p1", Lives: 100, MaxLives: 100}
	m := monster.NewMonster(100, 100, 16, 800, 800, monster.MonsterLives)
	gs.Players[p.PlayerId], gs.Monsters["m1"] = p, m

	gs.updateMonsters()
	if !monsterHasAcquiredTarget(m, p.PlayerId) {
		t.Fatalf("monster did not acquire a nearby player: state=%s target=%q", m.State, m.TargetPlayerId)
	}

	m.X = m.ChaseOriginX + monster.MonsterChaseLeash + 1
	p.X = m.X + 20
	gs.updateMonsters()

	if m.State == monster.MonsterChase || m.TargetPlayerId != "" {
		t.Fatalf("monster kept chasing beyond its leash: state=%s target=%q", m.State, m.TargetPlayerId)
	}
}

func TestMonsterDoesNotAcquirePlayerOutsideItsSight(t *testing.T) {
	gs := &GameState{
		State:    GameStateGame,
		Map:      &gamemap.GameMap{WidthInPixels: 800, HeightInPixels: 800},
		Walls:    geometry.NewSpatialHash(TileSize),
		Players:  map[string]*player.Player{},
		Monsters: map[string]*monster.Monster{},
	}
	p := &player.Player{CircleBody: geometry.CircleBody{X: 100 + monster.MonsterSight + 1, Y: 100, Radius: 16}, PlayerId: "p1", Lives: 100, MaxLives: 100}
	m := monster.NewMonster(100, 100, 16, 800, 800, monster.MonsterLives)
	gs.Players[p.PlayerId], gs.Monsters["m1"] = p, m

	gs.updateMonsters()

	if m.State == monster.MonsterChase || m.TargetPlayerId != "" {
		t.Fatalf("monster acquired a player outside sight range: state=%s target=%q", m.State, m.TargetPlayerId)
	}
}

func TestBatShowsNoticeWindowBeforeChasing(t *testing.T) {
	now := int64(10_000)
	gs := &GameState{
		State:    GameStateGame,
		Map:      &gamemap.GameMap{WidthInPixels: 800, HeightInPixels: 800},
		Walls:    geometry.NewSpatialHash(TileSize),
		Players:  map[string]*player.Player{},
		Monsters: map[string]*monster.Monster{},
		clockNow: func() int64 { return now },
	}
	p := &player.Player{CircleBody: geometry.CircleBody{X: 170, Y: 100, Radius: 16}, PlayerId: "p1", Lives: 100, MaxLives: 100}
	m := monster.NewMonsterAt(now, 100, 100, 16, 800, 800, monster.MonsterLives)
	gs.Players[p.PlayerId], gs.Monsters["m1"] = p, m

	gs.updateMonsters()
	if m.State != monster.MonsterNotice || m.TargetPlayerId != p.PlayerId || m.NoticeUntil <= now {
		t.Fatalf("bat notice = state=%s target=%q until=%d, want a visible pre-chase window", m.State, m.TargetPlayerId, m.NoticeUntil)
	}
	if m.MoveScale != 0 {
		t.Fatalf("bat moved during notice: move=(%.2f, %.2f) scale=%.2f", m.MoveX, m.MoveY, m.MoveScale)
	}

	now = m.NoticeUntil + 1
	gs.updateMonsters()
	if m.State != monster.MonsterChase || m.TargetPlayerId != p.PlayerId {
		t.Fatalf("bat did not enter chase after notice: state=%s target=%q", m.State, m.TargetPlayerId)
	}
}

func TestUnalertedBatPatrolsInsteadOfStandingStill(t *testing.T) {
	gs := &GameState{
		State:    GameStateGame,
		Map:      &gamemap.GameMap{WidthInPixels: 800, HeightInPixels: 800},
		Walls:    geometry.NewSpatialHash(TileSize),
		Players:  map[string]*player.Player{},
		Monsters: map[string]*monster.Monster{},
	}
	m := monster.NewMonster(300, 300, 16, 800, 800, monster.MonsterLives)
	gs.Monsters["m1"] = m
	beforeX, beforeY := m.X, m.Y

	gs.updateMonsters()

	if m.State != monster.MonsterPatrol {
		t.Fatalf("unalerted bat state=%s, want patrol", m.State)
	}
	if math.Hypot(m.X-beforeX, m.Y-beforeY) <= 0 {
		t.Fatalf("unalerted bat did not move during patrol: (%.2f, %.2f)", m.X, m.Y)
	}
}

func TestMonsterUsesSlightlyMoreAggressiveButBoundedSight(t *testing.T) {
	gs := &GameState{
		State:   GameStateGame,
		Map:     &gamemap.GameMap{WidthInPixels: 800, HeightInPixels: 800},
		Walls:   geometry.NewSpatialHash(TileSize),
		Players: map[string]*player.Player{}, Monsters: map[string]*monster.Monster{},
	}
	p := &player.Player{CircleBody: geometry.CircleBody{X: 100 + monster.MonsterSight - 10, Y: 100, Radius: 16}, PlayerId: "p1", Lives: 100, MaxLives: 100}
	m := monster.NewMonster(100, 100, 16, 800, 800, monster.MonsterLives)
	gs.Players[p.PlayerId], gs.Monsters["m1"] = p, m

	gs.updateMonsters()
	if !monsterHasAcquiredTarget(m, p.PlayerId) {
		t.Fatalf("monster did not acquire target inside its bounded sight: state=%s target=%q", m.State, m.TargetPlayerId)
	}
}

func TestMonsterLosesPlayerTrailWhenPlayerEntersBush(t *testing.T) {
	bush := &geometry.WallTile{MinX: 140, MinY: 60, MaxX: 240, MaxY: 140, Type: "bush", BushGroup: 7}
	walls := geometry.NewSpatialHash(TileSize)
	walls.Insert(bush)
	gs := &GameState{
		State:    GameStateGame,
		Map:      &gamemap.GameMap{WidthInPixels: 800, HeightInPixels: 800, Collisions: []*geometry.WallTile{bush}},
		Walls:    walls,
		Players:  map[string]*player.Player{},
		Monsters: map[string]*monster.Monster{},
	}
	p := &player.Player{CircleBody: geometry.CircleBody{X: 120, Y: 100, Radius: 16}, PlayerId: "p1", Lives: 100, MaxLives: 100}
	m := monster.NewMonster(100, 100, 16, 800, 800, monster.MonsterLives)
	gs.Players[p.PlayerId], gs.Monsters["m1"] = p, m

	gs.updateMonsters()
	if !monsterHasAcquiredTarget(m, p.PlayerId) {
		t.Fatalf("monster did not start chasing a visible player: state=%s", m.State)
	}

	m.X = 130
	p.X = 180
	gs.updateMonsters()

	if m.State == monster.MonsterChase || m.TargetPlayerId != "" || !m.ReturningHome {
		t.Fatalf("monster kept the target after it entered a bush: state=%s target=%q", m.State, m.TargetPlayerId)
	}
	before := m.X
	gs.updateMonsters()
	if m.X >= before {
		t.Fatalf("monster did not start returning after losing bush target: before=%.1f after=%.1f spawn=%.1f", before, m.X, m.SpawnX)
	}
}

func TestMonsterCoastsAfterLosingBushTargetBeforeTurningHome(t *testing.T) {
	bush := &geometry.WallTile{MinX: 140, MinY: 60, MaxX: 240, MaxY: 140, Type: "bush", BushGroup: 7}
	walls := geometry.NewSpatialHash(TileSize)
	walls.Insert(bush)
	gs := &GameState{
		State:    GameStateGame,
		Map:      &gamemap.GameMap{WidthInPixels: 800, HeightInPixels: 800, Collisions: []*geometry.WallTile{bush}},
		Walls:    walls,
		Players:  map[string]*player.Player{},
		Monsters: map[string]*monster.Monster{},
	}
	p := &player.Player{CircleBody: geometry.CircleBody{X: 120, Y: 100, Radius: 16}, PlayerId: "p1", Lives: 100, MaxLives: 100}
	m := monster.NewMonster(100, 100, 16, 800, 800, monster.MonsterLives)
	gs.Players[p.PlayerId], gs.Monsters["m1"] = p, m

	gs.updateMonsters()
	m.X, m.MoveX, m.MoveY, m.MoveScale = 130, 1, 0, 1
	p.X = 180
	beforeLoss := m.X
	gs.updateMonsters()

	if !m.ReturningHome || m.X <= beforeLoss {
		t.Fatalf("monster snapped into return-home on target loss: returning=%v before=%.2f after=%.2f", m.ReturningHome, beforeLoss, m.X)
	}
	coastPosition := m.X
	for tick := 0; tick < 20; tick++ {
		gs.updateMonsters()
	}
	if m.X >= coastPosition {
		t.Fatalf("monster never transitioned from coast to return: coast=%.2f after=%.2f spawn=%.2f", coastPosition, m.X, m.SpawnX)
	}
}

func TestMonsterAcquiresNearbyVisiblePlayerAcrossSolidCover(t *testing.T) {
	rock := &geometry.WallTile{MinX: 120, MinY: 80, MaxX: 160, MaxY: 120, Type: "wall"}
	walls := geometry.NewSpatialHash(TileSize)
	walls.Insert(rock)
	gs := &GameState{
		State:    GameStateGame,
		Map:      &gamemap.GameMap{WidthInPixels: 800, HeightInPixels: 800, Collisions: []*geometry.WallTile{rock}},
		Walls:    walls,
		Players:  map[string]*player.Player{},
		Monsters: map[string]*monster.Monster{},
	}
	p := &player.Player{CircleBody: geometry.CircleBody{X: 180, Y: 100, Radius: 16}, PlayerId: "p1", Lives: 100, MaxLives: 100}
	m := monster.NewMonster(100, 100, 16, 800, 800, monster.MonsterLives)
	gs.Players[p.PlayerId], gs.Monsters["m1"] = p, m

	gs.updateMonsters()

	if !monsterHasAcquiredTarget(m, p.PlayerId) {
		t.Fatalf("nearby visible player did not trigger monster across cover: state=%s target=%q", m.State, m.TargetPlayerId)
	}
}

func TestMonsterReturnsToSpawnAfterLosingTarget(t *testing.T) {
	gs := &GameState{
		State:   GameStateGame,
		Map:     &gamemap.GameMap{WidthInPixels: 900, HeightInPixels: 800},
		Walls:   geometry.NewSpatialHash(TileSize),
		Players: map[string]*player.Player{}, Monsters: map[string]*monster.Monster{},
	}
	p := &player.Player{CircleBody: geometry.CircleBody{X: 160, Y: 100, Radius: 16}, PlayerId: "p1", Lives: 100, MaxLives: 100}
	m := monster.NewMonster(100, 100, 16, 900, 800, monster.MonsterLives)
	gs.Players[p.PlayerId], gs.Monsters["m1"] = p, m

	gs.updateMonsters()
	m.X = m.SpawnX + monster.MonsterChaseLeash + 1
	p.X = m.X + 20
	gs.updateMonsters()
	if !m.ReturningHome || m.TargetPlayerId != "" {
		t.Fatalf("monster did not begin returning after leash break: returning=%v target=%q", m.ReturningHome, m.TargetPlayerId)
	}

	before := m.X
	returned := false
	for tick := 0; tick < 24; tick++ {
		gs.updateMonsters()
		if m.X < before {
			returned = true
			break
		}
	}
	if !returned {
		t.Fatalf("monster did not transition from chase coast to return: before=%.1f after=%.1f spawn=%.1f", before, m.X, m.SpawnX)
	}
}
