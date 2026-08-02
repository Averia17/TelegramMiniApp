package game

import (
	"battle/model/gamemap"
	"battle/model/monster"
	"battle/model/player"
	"battle/service/geometry"
	"testing"
)

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
	if m.State != monster.MonsterChase || m.TargetPlayerId != p.PlayerId {
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
	if m.State != monster.MonsterChase {
		t.Fatalf("monster did not start chasing a visible player: state=%s", m.State)
	}

	p.X = 180
	gs.updateMonsters()

	if m.State == monster.MonsterChase || m.TargetPlayerId != "" {
		t.Fatalf("monster kept the target after it entered a bush: state=%s target=%q", m.State, m.TargetPlayerId)
	}
}
