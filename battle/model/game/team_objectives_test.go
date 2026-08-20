package game

import (
	"battle/model/bullet"
	"battle/model/gamemap"
	"battle/model/player"
	"battle/service/geometry"
	"math"
	"testing"
	"time"
)

func newTeamObjectiveState() *GameState {
	state := newTestGameState()
	state.Mode = ModeTeamDeathmatch
	state.Map = gamemap.GenerateTeamBattle(gamemap.CanonicalTeamBattleSeed)
	state.State = GameStateGame
	state.Players = map[string]*player.Player{}
	state.Objectives = newObjectiveStates(objectiveDefinitions(state))
	state.PlayerAdd("blue", "Blue", "Needle")
	state.PlayerAdd("red", "Red", "Mandy")
	state.Players["blue"].SetTeam("Blue")
	state.Players["red"].SetTeam("Red")
	state.Players = map[string]*player.Player{"blue": state.Players["blue"], "red": state.Players["red"]}
	state.Players["blue"].X, state.Players["blue"].Y = 300, 2900
	state.Players["red"].X, state.Players["red"].Y = 2900, 300
	return state
}

func TestTeamRespawnDelayRampsFromFiveToFifteenSeconds(t *testing.T) {
	startedAt := int64(1_000_000)
	state := newTeamObjectiveState()
	state.MatchStartedAt = startedAt

	tests := []struct {
		name    string
		elapsed time.Duration
		want    time.Duration
	}{
		{name: "match start", elapsed: 0, want: 5 * time.Second},
		{name: "match midpoint", elapsed: TeamBattleDuration / 2, want: 10 * time.Second},
		{name: "match end", elapsed: TeamBattleDuration, want: 15 * time.Second},
		{name: "after match end", elapsed: TeamBattleDuration + time.Minute, want: 15 * time.Second},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := state.teamRespawnDelayAt(startedAt + tt.elapsed.Milliseconds()); got != tt.want {
				t.Fatalf("team respawn delay = %s, want %s", got, tt.want)
			}
		})
	}
}

func TestTeamObjectiveHealthUsesReducedBalanceValues(t *testing.T) {
	state := newTeamObjectiveState()

	for _, id := range []string{"blue-tower-west", "blue-tower-east", "red-tower-west", "red-tower-east"} {
		objective := state.Objectives[id]
		if objective.Lives != 1000 || objective.MaxLives != 1000 {
			t.Fatalf("%s health = %d/%d, want 1000/1000", id, objective.Lives, objective.MaxLives)
		}
	}
	for _, id := range []string{"blue-town-hall", "red-town-hall"} {
		objective := state.Objectives[id]
		if objective.Lives != 2000 || objective.MaxLives != 2000 {
			t.Fatalf("%s health = %d/%d, want 2000/2000", id, objective.Lives, objective.MaxLives)
		}
	}
}

func TestTeamLethalDamageSchedulesRespawnUsingMatchProgress(t *testing.T) {
	state := newTeamObjectiveState()
	state.MatchStartedAt = time.Now().Add(-TeamBattleDuration / 2).UnixMilli()
	target := state.Players["blue"]
	target.Lives = 1

	before := time.Now().UnixMilli()
	state.applyDamageAmount(target, 1)
	after := time.Now().UnixMilli()

	if target.RespawnAt < before+10_000 || target.RespawnAt > after+10_000 {
		t.Fatalf("respawn scheduled at %d, want about 10 seconds after damage (%d-%d)", target.RespawnAt, before+10_000, after+10_000)
	}
}

func TestTeamObjectiveCollisionBlocksHeroMovement(t *testing.T) {
	state := newTeamObjectiveState()
	state.Walls = geometry.NewSpatialHash(TileSize)
	for _, wall := range state.Map.Collisions {
		if wall.Type == "objective" {
			state.Walls.Insert(wall)
		}
	}
	tower := state.Objectives["red-tower-west"]
	body := geometry.CircleBody{X: tower.X - tower.Radius - 20, Y: tower.Y, Radius: 14}
	var collider *geometry.WallTile
	for _, wall := range state.Map.Collisions {
		if wall.Type == "objective" && tower.X >= wall.MinX && tower.X <= wall.MaxX && tower.Y >= wall.MinY && tower.Y <= wall.MaxY {
			collider = wall
			break
		}
	}
	if collider == nil {
		t.Fatal("tower has no objective collider")
	}
	geometry.MoveCircleWithBlockingWalls(&body, state.Walls, 200, 0)
	wantX := collider.MinX - body.Radius
	if math.Abs(body.X-wantX) > .001 {
		t.Fatalf("hero stopped at unexpected distance: x=%.1f, want=%.1f", body.X, wantX)
	}
}

func TestTeamObjectivesKeepTownHallProtectedWhileItsTowersLive(t *testing.T) {
	state := newTeamObjectiveState()
	source := state.Players["blue"]
	hall := state.Objectives["red-town-hall"]
	before := hall.Lives
	if state.damageObjective(source, hall, 1000) {
		t.Fatal("town hall should not take damage while both towers are alive")
	}
	if hall.Lives != before {
		t.Fatalf("protected town hall lives=%d, want %d", hall.Lives, before)
	}
	state.Objectives["red-tower-west"].Lives = 0
	state.Objectives["red-tower-east"].Lives = 0
	if !state.damageObjective(source, hall, 1000) || hall.Lives >= before {
		t.Fatal("town hall should become vulnerable after tower destruction")
	}
}

func TestTeamObjectiveDamageEmitsACombatHitForTheAttackingTower(t *testing.T) {
	state := newTeamObjectiveState()
	state.activeCommandID = "tower-attack-command"
	tower := state.Objectives["red-tower-west"]
	before := tower.Lives

	if !state.damageObjective(state.Players["blue"], tower, 150) {
		t.Fatal("enemy tower should take damage from a valid attack")
	}
	if tower.Lives != before-150 {
		t.Fatalf("tower lives=%d, want %d", tower.Lives, before-150)
	}
	if len(state.CombatEvents) != 1 || state.CombatEvents[0].TargetType != "objectives" || state.CombatEvents[0].TargetID != tower.ID {
		t.Fatalf("combat events=%+v, want one objective hit", state.CombatEvents)
	}
}

func TestMandyCanBreakAnEnemyTowerWithHerMeleeBasicAttack(t *testing.T) {
	state := newTeamObjectiveState()
	source := state.Players["blue"]
	tower := state.Objectives["red-tower-east"]
	source.X, source.Y, source.Rotation = tower.X-90, tower.Y, 0
	state.Players["red"].X, state.Players["red"].Y = 3200, 3200
	before := tower.Lives

	MandyKit{}.Basic(state, source, time.Now().UnixMilli(), 0, MandyKit{}.AttackRange())
	if tower.Lives >= before {
		t.Fatal("Mandy melee basic attack did not damage the enemy tower")
	}
}

func TestTeamTowerAttacksEnemyAndRespawnReturnsHeroToOwnBase(t *testing.T) {
	state := newTeamObjectiveState()
	state.Players["blue"].X, state.Players["blue"].Y = 2560, 680
	now := time.Now().UnixMilli()
	state.updateTeamObjectivesAt(now)
	if len(activeTowerShots(state)) != 0 {
		t.Fatal("tower shot spawned before its telegraph finished")
	}
	state.updateTeamObjectivesAt(now + teamTowerWindup + 1)
	if len(activeTowerShots(state)) == 0 {
		t.Fatal("enemy tower did not attack a hero in its range")
	}
	for step := 0; step < 80 && state.Players["blue"].Lives == state.Players["blue"].MaxLives; step++ {
		state.updateBullets()
	}
	if state.Players["blue"].Lives >= state.Players["blue"].MaxLives {
		t.Fatal("enemy tower projectile did not damage a hero in its range")
	}
	state.Players["blue"].Lives = 0
	state.Players["blue"].RespawnAt = time.Now().Add(-time.Second).UnixMilli()
	state.updateTeamRespawns(time.Now().UnixMilli())
	respawned := state.Players["blue"]
	nearOwnSpawner := false
	for _, spawner := range state.Map.TeamSpawners["Blue"] {
		if math.Hypot(respawned.X-(spawner.X+PlayerSize/2), respawned.Y-(spawner.Y+PlayerSize/2)) < 1 {
			nearOwnSpawner = true
			break
		}
	}
	if !respawned.IsAlive() || !nearOwnSpawner {
		t.Fatalf("hero did not respawn in the Blue base: alive=%v pos=(%.0f,%.0f)", respawned.IsAlive(), respawned.X, respawned.Y)
	}
}

func TestTeamRespawnClearsStaleMovement(t *testing.T) {
	state := newTeamObjectiveState()
	respawning := state.Players["blue"]
	respawning.Lives = 0
	respawning.RespawnAt = time.Now().Add(-time.Second).UnixMilli()
	respawning.MoveX, respawning.MoveY, respawning.Aiming = 1, -1, true

	state.updateTeamRespawns(time.Now().UnixMilli())

	if respawning.MoveX != 0 || respawning.MoveY != 0 || respawning.Aiming {
		t.Fatalf("respawn retained stale movement: move=(%.1f,%.1f) aiming=%v", respawning.MoveX, respawning.MoveY, respawning.Aiming)
	}
}

func TestTeamTowerFiresAProjectileBeforeDamageResolves(t *testing.T) {
	state := newTeamObjectiveState()
	state.Players["blue"].X, state.Players["blue"].Y = 2560, 680
	now := time.Now().UnixMilli()
	state.updateTeamObjectivesAt(now)

	if state.Players["blue"].Lives != state.Players["blue"].MaxLives {
		t.Fatalf("tower damage resolved instantly, lives=%d want=%d", state.Players["blue"].Lives, state.Players["blue"].MaxLives)
	}
	if len(activeTowerShots(state)) == 0 {
		state.updateTeamObjectivesAt(now + teamTowerWindup + 1)
	}
	if len(activeTowerShots(state)) == 0 {
		t.Fatalf("tower bullets=%+v, want tower_shot projectile after windup", state.Bullets)
	}

	for step := 0; step < 80 && state.Players["blue"].Lives == state.Players["blue"].MaxLives; step++ {
		state.updateBullets()
	}
	if state.Players["blue"].Lives >= state.Players["blue"].MaxLives {
		t.Fatal("tower projectile never damaged the enemy hero")
	}
	if len(state.CombatEvents) == 0 || state.CombatEvents[len(state.CombatEvents)-1].TargetType != "players" || state.CombatEvents[len(state.CombatEvents)-1].TargetID != "blue" {
		t.Fatalf("tower hit events=%+v, want a confirmed player hit", state.CombatEvents)
	}
}

func TestTeamTowerShotStopsWhenCoverAppearsDuringWindup(t *testing.T) {
	state := newTeamObjectiveState()
	state.Players["blue"].X, state.Players["blue"].Y = 2560, 680
	now := time.Now().UnixMilli()
	state.updateTeamObjectivesAt(now)
	wall := &geometry.WallTile{MinX: 2430, MinY: 590, MaxX: 2470, MaxY: 730, Type: "wall"}
	state.Walls = geometry.NewSpatialHash(TileSize)
	state.Walls.Insert(wall)
	state.updateTeamObjectivesAt(now + teamTowerWindup + 1)
	if len(activeTowerShots(state)) == 0 {
		t.Fatal("tower shot was not released after windup")
	}
	for step := 0; step < 80; step++ {
		state.updateBullets()
	}
	if state.Players["blue"].Lives != state.Players["blue"].MaxLives {
		t.Fatalf("tower shot ignored cover and damaged hero: lives=%d want=%d", state.Players["blue"].Lives, state.Players["blue"].MaxLives)
	}
	if len(activeTowerShots(state)) != 0 {
		t.Fatal("tower shot remained active after hitting cover")
	}
	blockedFeedback := false
	for _, effect := range state.Effects {
		if effect != nil && effect.Kind == "tower_shot_blocked" {
			blockedFeedback = true
			break
		}
	}
	if !blockedFeedback {
		t.Fatalf("tower shot hit cover without blocked-shot feedback: effects=%+v", state.Effects)
	}
}

func activeTowerShots(state *GameState) []*bullet.Bullet {
	shots := make([]*bullet.Bullet, 0)
	for _, candidate := range state.Bullets {
		if candidate != nil && candidate.Active && candidate.Kind == "tower_shot" {
			shots = append(shots, candidate)
		}
	}
	return shots
}
