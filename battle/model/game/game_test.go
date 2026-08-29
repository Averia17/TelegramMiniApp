package game

import (
	"battle/model/bullet"
	"battle/model/gamemap"
	"battle/model/monster"
	"battle/model/player"
	"battle/model/prop"
	"battle/service/geometry"
	"fmt"
	"math"
	"testing"
	"time"
)

func newTestGameState() *GameState {
	var messages []string
	gs := &GameState{
		RoomName:   "test",
		MapName:    "small",
		MaxPlayers: 8,
		Mode:       ModeDeathmatch,
		Broadcast: func(msgType string, params interface{}) {
			messages = append(messages, msgType)
		},
	}
	InitGameState(gs)
	return gs
}

func TestProjectilesFlyOverTeamRiverButStopAtStone(t *testing.T) {
	walls := geometry.NewSpatialHash(float64(TileSize))
	walls.Insert(&geometry.WallTile{MinX: 80, MinY: 0, MaxX: 120, MaxY: 200, Type: "river"})
	if segmentHitsBlockingWall(0, 100, 200, 100, 4, walls) {
		t.Fatal("projectile should fly over river collision")
	}
	walls.Insert(&geometry.WallTile{MinX: 140, MinY: 0, MaxX: 180, MaxY: 200, Type: "wall"})
	if !segmentHitsBlockingWall(0, 100, 200, 100, 4, walls) {
		t.Fatal("projectile should stop at stone wall")
	}
}

func TestProjectileCannotDamageHeroThroughBlockingWall(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	wall := &geometry.WallTile{MinX: 180, MinY: 0, MaxX: 220, MaxY: 240, Type: "wall"}
	gs.Map.Collisions = append(gs.Map.Collisions, wall)
	gs.Walls.Insert(wall)
	gs.PlayerAdd("attacker", "Attacker", "Needle")
	gs.PlayerAdd("target", "Target", "Needle")
	attacker, target := gs.Players["attacker"], gs.Players["target"]
	attacker.X, attacker.Y = 100, 120
	target.X, target.Y = 300, 120
	before := target.Lives
	gs.spawnAttackBullet(attacker, 0, "bolt", attacker.AttackDmg, 600, attacker.BulletSz, 700, 0, false, false)

	for step := 0; step < 80 && len(gs.Bullets) > 0; step++ {
		gs.updateBullets()
	}

	if target.Lives != before {
		t.Fatalf("projectile damaged hero through blocking wall: lives=%d want=%d", target.Lives, before)
	}
}

func TestPlayerMovementCannotEnterActiveLunarCrate(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.Map = &gamemap.GameMap{WidthInPixels: 400, HeightInPixels: 240}
	gs.Walls = geometry.NewSpatialHash(float64(TileSize))
	crate := prop.NewLunarCrate(140, 100, "speed")
	gs.Props = []*prop.Prop{crate}

	p := &player.Player{
		CircleBody: geometry.CircleBody{X: 80, Y: 100, Radius: 16},
		PlayerId:   "player",
		Lives:      100,
		MaxLives:   100,
		Speed:      600,
		MoveX:      1,
	}
	gs.Players = map[string]*player.Player{p.PlayerId: p}

	gs.updatePlayerMovement(time.Second)

	if geometry.CircleToCircle(&p.CircleBody, &crate.CircleBody) {
		t.Fatalf("player entered active lunar crate: player=(%.1f,%.1f), crate=(%.1f,%.1f)", p.X, p.Y, crate.X, crate.Y)
	}
}

func TestTeamBattleNeverDealsFriendlyFireThroughDamageGateway(t *testing.T) {
	gs := newTestGameState()
	gs.Mode = ModeTeamDeathmatch
	ally := &player.Player{PlayerId: "ally", Name: "Ally", HeroName: "Kaze", Lives: 100, MaxLives: 100}
	target := &player.Player{PlayerId: "target", Name: "Target", HeroName: "Needle", Lives: 100, MaxLives: 100}
	ally.SetTeam("Blue")
	target.SetTeam("Blue")
	gs.Players = map[string]*player.Player{ally.PlayerId: ally, target.PlayerId: target}
	before := target.Lives

	if dealt := gs.dealPlayerDamage(ally, target, 100); dealt != 0 {
		t.Fatalf("friendly-fire damage = %d, want 0", dealt)
	}
	if target.Lives != before {
		t.Fatalf("ally health changed from %d to %d", before, target.Lives)
	}
}

func TestRoutineDamageFeedbackUsesShortContactWindow(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("attacker", "Attacker", "Mandy")
	gs.PlayerAdd("target", "Target", "Needle")
	attacker, target := gs.Players["attacker"], gs.Players["target"]

	if dealt := gs.dealPlayerDamage(attacker, target, 20); dealt != 20 {
		t.Fatalf("damage = %d, want 20", dealt)
	}

	for _, effect := range gs.Effects {
		if effect.Kind == "damage" {
			if effect.ExpiresAt-effect.CreatedAt != 260 {
				t.Fatalf("damage feedback lifetime = %dms, want 260ms", effect.ExpiresAt-effect.CreatedAt)
			}
			return
		}
	}
	t.Fatal("damage feedback effect was not emitted")
}

func TestBattleDurationIncludesFinalPhase(t *testing.T) {
	want := OpeningCombatDuration + ChallengeDuration + CollapseDuration + FinalPhaseDuration
	if GameDuration != want {
		t.Fatalf("game duration = %s, want %s", GameDuration, want)
	}
}

func TestBattlePhasesRunAtDoubleSpeed(t *testing.T) {
	if LobbyDuration != 5*time.Second {
		t.Fatalf("lobby duration = %s, want 5s", LobbyDuration)
	}
	if GameDuration != 210*time.Second {
		t.Fatalf("game duration = %s, want 3m30s", GameDuration)
	}
	if OpeningCombatDuration != 60*time.Second {
		t.Fatalf("opening combat duration = %s, want 1m", OpeningCombatDuration)
	}
	if ChallengeDuration != 45*time.Second {
		t.Fatalf("challenge duration = %s, want 45s", ChallengeDuration)
	}
	if CollapseDuration != 45*time.Second {
		t.Fatalf("collapse duration = %s, want 45s", CollapseDuration)
	}
	if BeaconHoldDuration != 10*time.Second {
		t.Fatalf("beacon hold duration = %s, want 10s", BeaconHoldDuration)
	}
	if FinalPhaseDuration != 60*time.Second {
		t.Fatalf("final phase duration = %s, want 60s", FinalPhaseDuration)
	}
}

func TestTeamBattleUsesFiveMinuteDuration(t *testing.T) {
	if TeamBattleDuration != 5*time.Minute {
		t.Fatalf("team battle duration = %s, want 5m", TeamBattleDuration)
	}

	gs := newTestGameState()
	gs.Mode = ModeTeamDeathmatch
	gs.PlayerAdd("p1", "Alice", "Brock Zeus")
	gs.startGame()
	if got := gs.GameEndsAt - gs.MatchStartedAt; got != TeamBattleDuration.Milliseconds() {
		t.Fatalf("team battle end offset = %dms, want %dms", got, TeamBattleDuration.Milliseconds())
	}
}

func TestTeamBattleTimeoutUsesTownHallHealth(t *testing.T) {
	gs := newTeamObjectiveState()
	gs.Players["blue"].Kills = 99
	gs.Players["red"].Kills = 0
	gs.Objectives["blue-town-hall"].Lives = 1000
	gs.Objectives["red-town-hall"].Lives = 1500

	if winner := (TeamDeathmatchRules{}).TimeoutWinner(gs); winner != "Blue team" {
		t.Fatalf("timeout winner = %q, want Blue team from lower enemy town hall health", winner)
	}
}

func TestTeamBattleTimeoutIsDrawWhenTownHallHealthMatches(t *testing.T) {
	gs := newTeamObjectiveState()
	gs.Players["blue"].Kills = 99
	gs.Players["red"].Kills = 1
	gs.Objectives["blue-town-hall"].Lives = 1000
	gs.Objectives["red-town-hall"].Lives = 1000

	if winner := (TeamDeathmatchRules{}).TimeoutWinner(gs); winner != "" {
		t.Fatalf("timeout winner = %q, want draw when town hall health matches", winner)
	}
}

func TestTeamBattleTimeoutBroadcastsTownHallReason(t *testing.T) {
	gs := newTeamObjectiveState()
	gs.rules = TeamDeathmatchRules{}
	gs.GameEndsAt = time.Now().Add(-time.Second).UnixMilli()
	gs.Objectives["blue-town-hall"].Lives = 1000
	gs.Objectives["red-town-hall"].Lives = 1500
	var timeoutParams map[string]interface{}
	gs.Broadcast = func(messageType string, params interface{}) {
		if messageType == "timeout" {
			timeoutParams = params.(map[string]interface{})
		}
	}

	gs.Update()

	if timeoutParams["reason"] != "Победа по HP ратуши: у ратуши противника осталось меньше здоровья." {
		t.Fatalf("timeout reason = %q, want town hall health reason", timeoutParams["reason"])
	}
	if timeoutParams["duration"] != int64(TeamBattleDuration/time.Millisecond) {
		t.Fatalf("timeout duration = %v, want %dms", timeoutParams["duration"], TeamBattleDuration/time.Millisecond)
	}
}

func TestTeamBattleTimeoutDrawBroadcastsTownHallReason(t *testing.T) {
	gs := newTeamObjectiveState()
	gs.rules = TeamDeathmatchRules{}
	gs.GameEndsAt = time.Now().Add(-time.Second).UnixMilli()
	gs.Players["blue"].Kills = 20
	gs.Players["red"].Kills = 1
	gs.Objectives["blue-town-hall"].Lives = 1000
	gs.Objectives["red-town-hall"].Lives = 1000
	var timeoutParams map[string]interface{}
	gs.Broadcast = func(messageType string, params interface{}) {
		if messageType == "timeout" {
			timeoutParams = params.(map[string]interface{})
		}
	}

	gs.Update()

	if timeoutParams["draw"] != true || timeoutParams["name"] != "" {
		t.Fatalf("timeout result = %#v, want draw", timeoutParams)
	}
	if timeoutParams["reason"] != "Ничья: у ратуш одинаковое здоровье." {
		t.Fatalf("draw reason = %q, want equal town hall health reason", timeoutParams["reason"])
	}
}

func TestIslandPhasesFollowMatchClock(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	now := time.Now().UnixMilli()
	gs.MatchStartedAt = now - int64(31*time.Second/time.Millisecond)
	gs.updateIsland(now)
	if gs.IslandPhase != IslandPhaseHunt {
		t.Fatalf("phase after 31 seconds = %q, want %q", gs.IslandPhase, IslandPhaseHunt)
	}

	gs.MatchStartedAt = now - int64(61*time.Second)/int64(time.Millisecond)
	gs.updateIsland(now)
	if gs.IslandPhase != IslandPhaseChallenge {
		t.Fatalf("phase after 1:01 = %q, want %q", gs.IslandPhase, IslandPhaseChallenge)
	}

	gs.MatchStartedAt = now - int64(106*time.Second)/int64(time.Millisecond)
	gs.updateIsland(now)
	if gs.IslandPhase != IslandPhaseCollapse || gs.StormRadius <= 0 {
		t.Fatalf("collapse state = phase %q, storm radius %.1f", gs.IslandPhase, gs.StormRadius)
	}

	gs.MatchStartedAt = now - int64(150*time.Second)/int64(time.Millisecond)
	gs.updateIsland(now)
	if gs.IslandPhase != IslandPhaseBeacon || !gs.BeaconOpen {
		t.Fatalf("beacon state = phase %q, open=%v", gs.IslandPhase, gs.BeaconOpen)
	}
}

func TestTeamBattleDoesNotStartIslandPhasesOrHazards(t *testing.T) {
	gs := newTestGameState()
	gs.Mode = ModeTeamDeathmatch
	gs.MapName = "team-battle"
	gs.PlayerAdd("red", "Red", "Brock Zeus")
	gs.PlayerAdd("blue", "Blue", "Needle")
	gs.State = GameStateLobby
	gs.startGame()

	if gs.IslandPhase != "" || gs.PhaseStartedAt != 0 || gs.PhaseEndsAt != 0 {
		t.Fatalf("team battle started with island phase state: phase=%q started=%d ends=%d", gs.IslandPhase, gs.PhaseStartedAt, gs.PhaseEndsAt)
	}
	if gs.StormRadius != 0 || gs.StormDamage != 0 || gs.BeaconOpen || gs.SuddenDeathDamage != 0 {
		t.Fatalf("team battle started with island hazards: storm=%.1f/%d beacon=%v suddenDeath=%d", gs.StormRadius, gs.StormDamage, gs.BeaconOpen, gs.SuddenDeathDamage)
	}

	gs.MatchStartedAt -= int64((OpeningCombatDuration + ChallengeDuration + CollapseDuration + FinalPhaseDuration).Milliseconds())
	gs.updateGame()

	if gs.IslandPhase != "" || gs.StormRadius != 0 || gs.StormDamage != 0 || gs.BeaconOpen {
		t.Fatalf("team battle acquired island state during update: phase=%q storm=%.1f/%d beacon=%v", gs.IslandPhase, gs.StormRadius, gs.StormDamage, gs.BeaconOpen)
	}
}

func TestTeamBattleSchedulesRespawnAfterAnyLethalDamage(t *testing.T) {
	gs := newTestGameState()
	gs.Mode = ModeTeamDeathmatch
	gs.State = GameStateGame
	target := &player.Player{PlayerId: "target", Name: "Target", Lives: 10, MaxLives: 10}
	target.SetTeam("Blue")
	gs.Players[target.PlayerId] = target

	gs.applyDamageAmount(target, target.Lives)

	if target.IsAlive() {
		t.Fatal("lethal damage did not kill the team player")
	}
	if target.RespawnAt <= time.Now().UnixMilli() {
		t.Fatalf("team player has no future respawn time: %d", target.RespawnAt)
	}
}

func TestSoloLethalDamageRecordsPlacementOrder(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	for _, candidate := range []*player.Player{
		{PlayerId: "winner", Name: "Winner", Lives: 10, MaxLives: 10},
		{PlayerId: "third", Name: "Third", Lives: 10, MaxLives: 10},
		{PlayerId: "second", Name: "Second", Lives: 10, MaxLives: 10},
	} {
		gs.Players[candidate.PlayerId] = candidate
	}

	gs.applyDamageAmount(gs.Players["third"], 10)
	gs.applyDamageAmount(gs.Players["second"], 10)
	gs.finalizeBattlePlaces("Winner")

	if gs.Players["winner"].Place != 1 || gs.Players["second"].Place != 2 || gs.Players["third"].Place != 3 {
		t.Fatalf("placements = winner:%d second:%d third:%d, want 1/2/3", gs.Players["winner"].Place, gs.Players["second"].Place, gs.Players["third"].Place)
	}
}

func TestSoloWinnerPlacementUsesPlayerIDWhenNamesCollide(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.Players = map[string]*player.Player{
		"winner": {PlayerId: "winner", Name: "Same name", Lives: 10, MaxLives: 10},
		"other":  {PlayerId: "other", Name: "Same name", Lives: 10, MaxLives: 10},
	}
	gs.WinnerPlayerID = "winner"

	gs.finalizeBattlePlaces("Same name")
	if gs.Players["winner"].Place != 1 || gs.Players["other"].Place == 1 {
		t.Fatalf("duplicate-name placements = winner:%d other:%d, want only winner id placed first", gs.Players["winner"].Place, gs.Players["other"].Place)
	}
}

func TestTeamBattleBotsUseTheirOwnTeamSpawners(t *testing.T) {
	for _, team := range []string{"Blue", "Red"} {
		t.Run(team, func(t *testing.T) {
			gs := &GameState{Mode: ModeTeamDeathmatch, MapName: "team-battle", MaxPlayers: 2}
			InitGameState(gs)
			human := &player.Player{PlayerId: "human", Team: team}
			bot := &player.Player{PlayerId: "bot", Team: team, IsBot: true}
			gs.Players = map[string]*player.Player{human.PlayerId: human, bot.PlayerId: bot}

			gs.setPlayersPositionForTeams()
			gs.setBotsPositionAtFreeSpawns()

			for _, spawn := range gs.Map.TeamSpawners[team] {
				if bot.X >= spawn.X && bot.X <= spawn.X+spawn.Width && bot.Y >= spawn.Y && bot.Y <= spawn.Y+spawn.Height {
					return
				}
			}
			t.Fatalf("%s bot spawned outside its team spawners at (%.0f, %.0f)", team, bot.X, bot.Y)
		})
	}
}

func TestTeamBotLeavesItsSpawnWhenMatchStarts(t *testing.T) {
	gs := &GameState{Mode: ModeTeamDeathmatch, MapName: "team-battle", MaxPlayers: 2}
	InitGameState(gs)
	gs.PlayerAdd("bot", "Bot", "Needle")
	bot := gs.Players["bot"]
	bot.IsBot = true
	bot.SetTeam("Blue")
	gs.State = GameStateGame
	gs.setPlayersPositionForTeams()
	startX, startY := bot.X, bot.Y

	for tick := 0; tick < 120; tick++ {
		gs.updatePlayerMovement(16 * time.Millisecond)
		gs.updateBots()
	}

	if distance := math.Hypot(bot.X-startX, bot.Y-startY); distance < 20 {
		t.Fatalf("team bot stayed at its spawn after AI updates: start=(%.1f, %.1f) now=(%.1f, %.1f) distance=%.1f move=(%.2f, %.2f)", startX, startY, bot.X, bot.Y, distance, bot.MoveX, bot.MoveY)
	}
}

func TestTeamBotsDoNotClusterAtBaseAfterFullStart(t *testing.T) {
	gs := &GameState{Mode: ModeTeamDeathmatch, MapName: "team-battle", MaxPlayers: 6}
	InitGameState(gs)
	gs.PlayerAdd("human", "Human", "Needle")
	gs.Players["human"].SetTeam("Blue")
	gs.State = GameStateLobby
	gs.startGame()

	starts := make(map[string]geometry.Vector2)
	for id, bot := range gs.Players {
		if bot.IsBot {
			starts[id] = geometry.Vector2{X: bot.X, Y: bot.Y}
		}
	}
	for tick := 0; tick < 120; tick++ {
		gs.updatePlayerMovement(16 * time.Millisecond)
		gs.updateBots()
	}

	for id, start := range starts {
		bot := gs.Players[id]
		if distance := math.Hypot(bot.X-start.X, bot.Y-start.Y); distance < 20 {
			t.Fatalf("bot %s stayed at its team base after full match start: start=(%.1f, %.1f) now=(%.1f, %.1f) distance=%.1f move=(%.2f, %.2f)", id, start.X, start.Y, bot.X, bot.Y, distance, bot.MoveX, bot.MoveY)
		}
	}
}

func TestLateJoinTeamPlayerUsesOwnTeamSpawner(t *testing.T) {
	gs := &GameState{Mode: ModeTeamDeathmatch, MapName: "team-battle", MaxPlayers: 4, State: GameStateGame}
	InitGameState(gs)
	teammate := &player.Player{PlayerId: "teammate", Team: "Blue"}
	joined := &player.Player{PlayerId: "joined", Team: "Blue"}
	gs.Players = map[string]*player.Player{teammate.PlayerId: teammate, joined.PlayerId: joined}
	gs.setPlayersPositionForTeams()

	// Simulate PlayerAdd's initial random placement before the transport assigns
	// the late joiner's final team.
	enemySpawn := gs.Map.TeamSpawners["Red"][0]
	joined.X, joined.Y = enemySpawn.X+PlayerSize/2, enemySpawn.Y+PlayerSize/2
	gs.PlacePlayerAtTeamSpawn(joined.PlayerId)

	for _, spawn := range gs.Map.TeamSpawners["Blue"] {
		if joined.X >= spawn.X && joined.X <= spawn.X+spawn.Width && joined.Y >= spawn.Y && joined.Y <= spawn.Y+spawn.Height {
			return
		}
	}
	t.Fatalf("late Blue player spawned outside its team spawners at (%.0f, %.0f)", joined.X, joined.Y)
}

func TestTeamBattleSpawnClearsLobbyMovement(t *testing.T) {
	gs := &GameState{Mode: ModeTeamDeathmatch, MapName: "team-battle", MaxPlayers: 2}
	InitGameState(gs)
	p := &player.Player{PlayerId: "moving", Team: "Blue", MoveX: 1, MoveY: -1, Aiming: true}
	gs.Players = map[string]*player.Player{p.PlayerId: p}

	gs.setPlayersPositionForTeams()

	if p.MoveX != 0 || p.MoveY != 0 || p.Aiming {
		t.Fatalf("team spawn retained lobby input: move=(%.1f, %.1f) aiming=%v", p.MoveX, p.MoveY, p.Aiming)
	}
}

func TestTeamBattleDoesNotReplayLobbyActionsAfterSpawn(t *testing.T) {
	gs := &GameState{Mode: ModeTeamDeathmatch, MapName: "team-battle", MaxPlayers: 2, State: GameStateLobby}
	InitGameState(gs)
	gs.State = GameStateLobby
	gs.PlayerAdd("moving", "Moving", "Needle")
	p := gs.Players["moving"]
	p.SetTeam("Blue")
	p.TeamLocked = true
	gs.Players = map[string]*player.Player{p.PlayerId: p}
	gs.LobbyEndsAt = time.Now().Add(-time.Second).UnixMilli()
	spawn := gs.Map.TeamSpawners["Blue"][0]
	gs.Actions = []Action{{PlayerId: p.PlayerId, Type: "move", Ts: gs.LobbyEndsAt - 1, Value: &MoveValue{X: 1, Y: 0}}}

	gs.UpdateWithDelta(time.Second / 60)

	wantX, wantY := spawn.X+PlayerSize/2, spawn.Y+PlayerSize/2
	if p.X != wantX || p.Y != wantY {
		t.Fatalf("stale lobby input moved player from team spawn: got=(%.2f,%.2f) want=(%.2f,%.2f) move=(%.1f,%.1f) actions=%d start=%d", p.X, p.Y, wantX, wantY, p.MoveX, p.MoveY, len(gs.Actions), gs.MatchStartedAt)
	}
	if p.MoveX != 0 || p.MoveY != 0 {
		t.Fatalf("stale lobby movement remained active: move=(%.1f,%.1f)", p.MoveX, p.MoveY)
	}
}

func TestCombatRemainsEnabledForLegacyLandingSnapshots(t *testing.T) {
	gs := newTestGameState()
	gs.MaxPlayers = 2
	gs.PlayerAdd("attacker", "Attacker", "Brock Zeus")
	gs.PlayerAdd("target", "Target", "Needle")
	gs.State = GameStateGame
	gs.IslandPhase = IslandPhaseLanding
	attacker := gs.Players["attacker"]
	attacker.Ammo = 1
	gs.playerShootWithCommand(attacker.PlayerId, time.Now().UnixMilli(), 0, "landing-shot", 300)
	if attacker.Ammo != 0 {
		t.Fatalf("attack from a legacy landing snapshot was blocked: ammo = %d", attacker.Ammo)
	}
}

func TestMatchStartsWithCombatEnabled(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("attacker", "Attacker", "Brock Zeus")
	gs.PlayerAdd("target", "Target", "Needle")
	gs.State = GameStateLobby
	gs.startGame()

	attacker := gs.Players["attacker"]
	attacker.Ammo = 1
	gs.playerShootWithCommand(attacker.PlayerId, time.Now().UnixMilli(), 0, "opening-shot", 300)

	if gs.IslandPhase == IslandPhaseLanding {
		t.Fatal("match still starts in the landing phase")
	}
	if attacker.Ammo != 0 {
		t.Fatalf("opening attack was blocked: ammo = %d", attacker.Ammo)
	}
}

func TestCombatAttackDamagesLunarCrate(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("attacker", "Attacker", "Wukong Mico")
	gs.State = GameStateGame
	gs.IslandPhase = IslandPhaseHunt
	attacker := gs.Players["attacker"]
	attacker.X, attacker.Y, attacker.Ammo = 100, 100, 1
	crate := prop.NewLunarCrate(160, 100, "damage")
	gs.Props = append(gs.Props, crate)

	gs.playerShootWithCommand(attacker.PlayerId, time.Now().UnixMilli(), 0, "crate-hit", 120)

	if crate.Lives >= crate.MaxLives {
		t.Fatalf("attack did not damage lunar crate: %d/%d", crate.Lives, crate.MaxLives)
	}
}

func TestDestroyedLunarCrateDropsCollectibleBuff(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("attacker", "Attacker", "Wukong Mico")
	gs.State = GameStateGame
	gs.IslandPhase = IslandPhaseHunt
	attacker := gs.Players["attacker"]
	crate := prop.NewLunarCrate(160, 100, "speed")
	crate.Lives = 1
	gs.Props = append(gs.Props, crate)

	if !gs.damageLunarCrate(attacker, crate, 1) {
		t.Fatal("crate damage was not accepted")
	}
	var reward *prop.Prop
	for _, candidate := range gs.Props {
		if candidate.Type == "lunar_speed" {
			reward = candidate
			break
		}
	}
	if crate.Active || reward == nil || !reward.Active {
		t.Fatalf("crate/reward state = crate active %v, reward %#v", crate.Active, reward)
	}

	attacker.X, attacker.Y = reward.X, reward.Y
	gs.collectPickups(attacker)
	if reward.Active || attacker.LunarSpeedUntil <= time.Now().UnixMilli() {
		t.Fatalf("speed buff was not collected: active=%v until=%d", reward.Active, attacker.LunarSpeedUntil)
	}
}

func TestLunarShieldBlocksTheFirstIncomingHit(t *testing.T) {
	p := &player.Player{Lives: 500, MaxLives: 500, LunarShield: true, ShieldHP: 300}
	p.TakeDamage(100)

	if p.Lives != 500 || p.LunarShield {
		t.Fatalf("shield after first hit = lives %d, active %v", p.Lives, p.LunarShield)
	}
}

func TestBeaconRequiresTenSecondsOfContinuousControl(t *testing.T) {
	gs := newTestGameState()
	gs.MaxPlayers = 1
	gs.State = GameStateGame
	gs.IslandPhase = IslandPhaseBeacon
	gs.BeaconOpen = true
	gs.BeaconHoldStartedAt = make(map[string]int64)
	gs.PlayerAdd("holder", "Holder", "Needle")
	player := gs.Players["holder"]
	player.X, player.Y = gs.Map.WidthInPixels/2, gs.Map.HeightInPixels/2
	now := time.Now().UnixMilli()
	gs.updateBeacon(now)
	if gs.beaconWinner(now) != nil {
		t.Fatal("beacon awarded before ten seconds")
	}
	if gs.beaconWinner(now+BeaconHoldDuration.Milliseconds()-1) != nil {
		t.Fatal("beacon awarded before hold duration elapsed")
	}
	if gs.beaconWinner(now+BeaconHoldDuration.Milliseconds()+1) == nil {
		t.Fatal("beacon did not award after continuous hold")
	}
}

func TestSuddenDeathDamageGrowsForTwoRemainingPlayers(t *testing.T) {
	gs := newTestGameState()
	gs.MaxPlayers = 2
	gs.State = GameStateGame
	gs.IslandPhase = IslandPhaseBeacon
	gs.PlayerAdd("one", "One", "Needle")
	gs.PlayerAdd("two", "Two", "Brock Zeus")
	first, second := gs.Players["one"], gs.Players["two"]
	now := time.Now().UnixMilli()
	gs.SuddenDeathStartedAt = now - 2*1000
	gs.SuddenDeathNextTickAt = now
	firstBefore, secondBefore := first.Lives, second.Lives
	gs.applySuddenDeath(now)
	firstAfterFirstTick, secondAfterFirstTick := first.Lives, second.Lives
	gs.SuddenDeathNextTickAt = now + 1000
	gs.applySuddenDeath(now + 1000)
	if firstBefore-firstAfterFirstTick <= 0 || secondBefore-secondAfterFirstTick <= 0 {
		t.Fatal("sudden death did not damage both remaining players")
	}
	firstTickDamage := firstBefore - firstAfterFirstTick
	secondTickDamage := firstAfterFirstTick - first.Lives
	if secondTickDamage <= firstTickDamage {
		t.Fatalf("sudden death damage did not grow: first=%d second=%d", firstTickDamage, secondTickDamage)
	}
}

func TestSuddenDeathDamageAppliesToThreeRemainingPlayers(t *testing.T) {
	gs := newTestGameState()
	gs.MaxPlayers = 3
	gs.State = GameStateGame
	gs.IslandPhase = IslandPhaseBeacon
	gs.PlayerAdd("one", "One", "Needle")
	gs.PlayerAdd("two", "Two", "Brock Zeus")
	gs.PlayerAdd("three", "Three", "Mandy")
	now := time.Now().UnixMilli()
	gs.SuddenDeathStartedAt = now - 1000
	gs.SuddenDeathNextTickAt = now

	before := make(map[string]int, len(gs.Players))
	for id, candidate := range gs.Players {
		before[id] = candidate.Lives
	}
	gs.applySuddenDeath(now)

	if gs.SuddenDeathDamage <= 0 {
		t.Fatal("sudden death damage should be active with three remaining players")
	}
	for id, candidate := range gs.Players {
		if candidate.Lives >= before[id] {
			t.Fatalf("player %q did not lose health during final phase", id)
		}
	}
}

func TestAbilityPullCannotMoveHeroThroughBlockingWall(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	wall := &geometry.WallTile{MinX: 180, MinY: 0, MaxX: 220, MaxY: 240, Type: "wall"}
	gs.Map.Collisions = append(gs.Map.Collisions, wall)
	gs.Walls.Insert(wall)
	gs.PlayerAdd("source", "Source", "Needle")
	gs.PlayerAdd("target", "Target", "Needle")
	source, target := gs.Players["source"], gs.Players["target"]
	source.X, source.Y = 100, 120
	target.X, target.Y = 300, 120

	gs.pullTargets(source, source.X, source.Y, 260, 150)

	if target.X < wall.MaxX+target.Radius-1 {
		t.Fatalf("ability pull crossed blocking wall: target x=%.1f, want at least %.1f", target.X, wall.MaxX+target.Radius-1)
	}
	if geometry.CollidesCircleWithBlockingWalls(&target.CircleBody, gs.Walls) {
		t.Fatalf("ability pull left target inside blocking wall at (%.1f, %.1f)", target.X, target.Y)
	}
}

func TestSuddenDeathLeavesOneSurvivorWhenATickWouldKillEveryone(t *testing.T) {
	gs := newTestGameState()
	gs.MaxPlayers = 3
	gs.State = GameStateGame
	gs.IslandPhase = IslandPhaseBeacon
	gs.PlayerAdd("one", "One", "Needle")
	gs.PlayerAdd("two", "Two", "Brock Zeus")
	gs.PlayerAdd("three", "Three", "Mandy")
	for _, candidate := range gs.Players {
		candidate.Lives = 20
	}
	now := time.Now().UnixMilli()
	gs.SuddenDeathStartedAt = now - 10*1000
	gs.SuddenDeathNextTickAt = now

	gs.applySuddenDeath(now)

	if got := gs.countActivePlayers(); got != 1 {
		t.Fatalf("active players after lethal final-phase tick = %d, want 1", got)
	}
}

func TestUpdateRegenerationAppliesBatchedFifteenPercentPulse(t *testing.T) {
	gs := newTestGameState()
	gs.MaxPlayers = 1
	gs.State = GameStateGame
	gs.PlayerAdd("regen", "Regen", "Needle")
	p := gs.Players["regen"]
	p.Lives = p.MaxLives / 2
	now := int64(10_000_000)
	p.LastDamageAt = now - int64(4*time.Second/time.Millisecond)
	start := p.Lives

	gs.updateRegenerationAt(now)

	want := 98 // Needle's 600 HP pulse is intentionally floored by the carry model.
	if got := p.Lives - start; got != want {
		t.Fatalf("regenerated %d HP in one pulse, want %d", got, want)
	}
}

func TestUpdateRegenerationUsesHeroSpecificRate(t *testing.T) {
	gs := newTestGameState()
	gs.MaxPlayers = 2
	// Add exactly the two test subjects; adding during Game fills empty slots
	// with bots, whose random positions can legitimately suppress regeneration.
	gs.State = GameStateLobby
	gs.PlayerAdd("mina", "Mina", "Fairy Mina")
	gs.PlayerAdd("needle", "Needle", "Needle")
	gs.State = GameStateGame
	mina, needle := gs.Players["mina"], gs.Players["needle"]
	// Keep the comparison independent from the random map spawners. A nearby
	// opponent is allowed to suppress passive regeneration, which would make
	// this hero-rate assertion flaky.
	mina.X, mina.Y = 200, 200
	needle.X, needle.Y = 1800, 1800
	mina.Lives, needle.Lives = mina.MaxLives/2, needle.MaxLives/2
	now := int64(10_000_000)
	mina.LastDamageAt, needle.LastDamageAt = now-4_000, now-4_000

	gs.updateRegenerationAt(now)

	minaHealed := mina.Lives - mina.MaxLives/2
	needleHealed := needle.Lives - needle.MaxLives/2
	if minaHealed != 77 || needleHealed != 98 {
		t.Fatalf("passive regeneration Mina=%d HP, Needle=%d HP; want 77 and 98", minaHealed, needleHealed)
	}
}

func TestUpdateRegenerationStopsWhenVisibleEnemyIsPursuingInOpenField(t *testing.T) {
	gs := newTestGameState()
	gs.MaxPlayers = 2
	gs.State = GameStateGame
	gs.PlayerAdd("regen", "Regen", "Needle")
	gs.PlayerAdd("hunter", "Hunter", "Mandy")
	p, hunter := gs.Players["regen"], gs.Players["hunter"]
	p.X, p.Y = 300, 300
	hunter.X, hunter.Y = 450, 300
	p.Lives = p.MaxLives / 2
	now := int64(10_000_000)
	p.LastDamageAt = now - int64(10*time.Second/time.Millisecond)

	gs.updateRegenerationAt(now)

	if p.Lives != p.MaxLives/2 {
		t.Fatalf("regenerated while a visible enemy was pursuing in the open field: got %d", p.Lives)
	}
}

func TestUpdateRegenerationStillWorksWhenPursuedIntoBush(t *testing.T) {
	gs := newTestGameState()
	gs.MaxPlayers = 2
	gs.State = GameStateGame
	gs.PlayerAdd("regen", "Regen", "Needle")
	gs.PlayerAdd("hunter", "Hunter", "Mandy")
	p, hunter := gs.Players["regen"], gs.Players["hunter"]
	p.X, p.Y = 110, 110
	hunter.X, hunter.Y = 150, 110
	p.Lives = p.MaxLives / 2
	now := int64(10_000_000)
	p.LastDamageAt = now - int64(10*time.Second/time.Millisecond)
	gs.Map.Collisions = []*geometry.WallTile{{MinX: 100, MinY: 100, MaxX: 140, MaxY: 140, Type: "bush", BushGroup: 1}}

	gs.updateRegenerationAt(now)

	want := int(float64(p.MaxLives) * heroRegenerationPulsePercent(p, false))
	if got := p.Lives - p.MaxLives/2; got != want {
		t.Fatalf("regenerated %d HP in bush while pursued, want %d", got, want)
	}
}

func TestUpdateRegenerationWaitsBetweenPulsesAndAfterDamage(t *testing.T) {
	gs := newTestGameState()
	gs.MaxPlayers = 1
	gs.State = GameStateGame
	gs.PlayerAdd("regen", "Regen", "Needle")
	p := gs.Players["regen"]
	p.Lives = p.MaxLives / 2
	now := int64(10_000_000)
	p.LastDamageAt = now - int64(regenerationCooldown/time.Millisecond)

	gs.updateRegenerationAt(now)
	first := p.Lives
	gs.updateRegenerationAt(now + int64(regenerationInterval/time.Millisecond) - 1)
	if p.Lives != first {
		t.Fatalf("regenerated during the interval: got %d, want %d", p.Lives, first)
	}
	gs.updateRegenerationAt(now + int64(regenerationInterval/time.Millisecond))
	if p.Lives <= first {
		t.Fatalf("did not regenerate on the next pulse: got %d, first %d", p.Lives, first)
	}

	p.Lives = p.MaxLives / 2
	p.LastRegenAt = now
	p.LastDamageAt = now + 1
	gs.updateRegenerationAt(now + int64(regenerationInterval/time.Millisecond))
	if p.Lives != p.MaxLives/2 {
		t.Fatalf("regenerated before the post-damage cooldown: got %d", p.Lives)
	}
}

func TestUpdateRegenerationWaitsDuringHostileStatusAndStartsCooldownAfterIt(t *testing.T) {
	statusSetters := map[string]func(*player.Player, int64){
		"slow":   func(p *player.Player, until int64) { p.SlowUntil = until },
		"stun":   func(p *player.Player, until int64) { p.StunUntil = until },
		"blind":  func(p *player.Player, until int64) { p.BlindUntil = until },
		"root":   func(p *player.Player, until int64) { p.VineUntil = until },
		"vortex": func(p *player.Player, until int64) { p.VortexUntil = until },
		"poison": func(p *player.Player, until int64) { p.PoisonUntil = until },
	}

	for name, setStatus := range statusSetters {
		t.Run(name, func(t *testing.T) {
			gs := newTestGameState()
			gs.MaxPlayers = 1
			gs.State = GameStateGame
			gs.PlayerAdd("regen", "Regen", "Needle")
			p := gs.Players["regen"]
			p.Lives = p.MaxLives / 2
			now := int64(10_000_000)
			p.LastDamageAt = now - int64(10*time.Second/time.Millisecond)
			setStatus(p, now+1)

			gs.updateRegenerationAt(now)
			if p.Lives != p.MaxLives/2 {
				t.Fatalf("regenerated while %s was active: got %d", name, p.Lives)
			}
			if p.LastDamageAt != now {
				t.Fatalf("last hostile interaction after %s = %d, want %d", name, p.LastDamageAt, now)
			}

			setStatus(p, now)
			gs.updateRegenerationAt(now + regenerationCooldown.Milliseconds() - 1)
			if p.Lives != p.MaxLives/2 {
				t.Fatalf("regenerated before post-%s cooldown elapsed: got %d", name, p.Lives)
			}
		})
	}
}

func TestBlockedHostileHitStillInterruptsRegeneration(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("target", "Target", "Needle")
	target := gs.Players["target"]
	target.Lives = target.MaxLives / 2
	target.LastDamageAt = 1
	target.InvulnerableUntil = time.Now().Add(time.Second).UnixMilli()

	before := target.Lives
	if dealt := gs.applyDamageAmount(target, 100); dealt != 0 {
		t.Fatalf("damage through invulnerability = %d, want 0", dealt)
	}
	if target.Lives != before {
		t.Fatalf("lives after blocked hit = %d, want %d", target.Lives, before)
	}
	if target.LastDamageAt == 1 {
		t.Fatal("blocked hostile hit did not interrupt regeneration")
	}
}

func TestUpdateRegenerationKeepsTwentyFivePercentPulseInConcealment(t *testing.T) {
	gs := newTestGameState()
	gs.MaxPlayers = 2
	gs.PlayerAdd("regen", "Regen", "Needle")
	gs.PlayerAdd("enemy", "Enemy", "Mandy")
	gs.State = GameStateGame
	p, enemy := gs.Players["regen"], gs.Players["enemy"]
	p.X, p.Y = 110, 110
	enemy.X, enemy.Y = 600, 600
	p.Lives = p.MaxLives / 2
	now := int64(10_000_000)
	p.LastDamageAt = now - int64(4*time.Second/time.Millisecond)
	gs.Map.Collisions = []*geometry.WallTile{{MinX: 100, MinY: 100, MaxX: 140, MaxY: 140, Type: "bush", BushGroup: 1}}

	start := p.Lives
	gs.updateRegenerationAt(now)

	want := int(float64(p.MaxLives) * heroRegenerationPulsePercent(p, true))
	if got := p.Lives - start; got != want {
		t.Fatalf("regenerated %d HP in concealment, want %d", got, want)
	}
}

func TestUpdateRegenerationHealsOnePercentPerSecondInOwnBaseSemicircleDuringCombat(t *testing.T) {
	gs := newTeamRegenerationTestGameState(t)
	p := gs.Players["blue"]
	p.SetTeam("Blue")
	blueSpawn := gs.Map.TeamSpawners["Blue"][0]
	p.X, p.Y = blueSpawn.CenterX(), blueSpawn.CenterY()
	p.Lives = p.MaxLives / 2
	now := int64(10_000_000)
	p.LastDamageAt = now
	p.PoisonUntil = now + 5_000

	gs.updateRegenerationAt(now)
	gs.updateRegenerationAt(now + 1_000)

	want := int(math.Round(float64(p.MaxLives) * .01))
	if got := p.Lives - p.MaxLives/2; got != want {
		t.Fatalf("base combat regeneration = %d HP, want %d", got, want)
	}
}

func TestUpdateRegenerationDoesNotHealAtEnemyBase(t *testing.T) {
	gs := newTeamRegenerationTestGameState(t)
	p := gs.Players["blue"]
	p.SetTeam("Blue")
	redSpawn := gs.Map.TeamSpawners["Red"][0]
	p.X, p.Y = redSpawn.CenterX(), redSpawn.CenterY()
	p.Lives = p.MaxLives / 2
	now := int64(10_000_000)
	p.LastDamageAt = now

	gs.updateRegenerationAt(now)
	gs.updateRegenerationAt(now + 1_000)

	if p.Lives != p.MaxLives/2 {
		t.Fatalf("regenerated at enemy base: got %d, want %d", p.Lives, p.MaxLives/2)
	}
}

func newTeamRegenerationTestGameState(t *testing.T) *GameState {
	t.Helper()
	gs := &GameState{RoomName: "test", MapName: "team-battle", MaxPlayers: 2, Mode: ModeTeamDeathmatch}
	InitGameState(gs)
	gs.State = GameStateGame
	gs.PlayerAdd("blue", "Blue", "Needle")
	return gs
}

func TestConnectedBushGroupRevealsPlayersAcrossGrass(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("hidden", "Hidden", "Kaze")
	gs.PlayerAdd("enemy", "Enemy", "Brock Zeus")
	hidden, enemy := gs.Players["hidden"], gs.Players["enemy"]
	hidden.X, hidden.Y, enemy.X, enemy.Y = 110, 110, 310, 110
	gs.Map.Collisions = []*geometry.WallTile{
		{MinX: 100, MinY: 100, MaxX: 140, MaxY: 140, Type: "bush", BushGroup: 7},
		{MinX: 300, MinY: 100, MaxX: 340, MaxY: 140, Type: "bush", BushGroup: 7},
	}
	if gs.isConcealed(hidden) {
		t.Fatal("player must be revealed by an enemy anywhere in the same connected bush group")
	}
	enemy.X, enemy.Y = 600, 600
	if !gs.isConcealed(hidden) {
		t.Fatal("player should be concealed when every enemy is far and outside the bush group")
	}
}

func TestBotFarmsCrateDuringOpeningInsteadOfStandingStill(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("bot", "Bot", "Kaze")
	bot := gs.Players["bot"]
	bot.IsBot, bot.X, bot.Y = true, 100, 100
	gs.Map.Collisions = []*geometry.WallTile{{MinX: 300, MinY: 100, MaxX: 340, MaxY: 140, Type: "crates"}}
	gs.State = GameStateGame
	gs.GameEndsAt = time.Now().Add(GameDuration).UnixMilli()

	gs.updateBots()

	if bot.MoveX <= 0 || math.Abs(bot.MoveY) > .2 {
		t.Fatalf("opening bot move=(%.2f, %.2f), want movement toward crate", bot.MoveX, bot.MoveY)
	}
}

func TestInitGameState(t *testing.T) {
	gs := &GameState{
		RoomName:  "test",
		MapName:   "small",
		Mode:      ModeDeathmatch,
		Broadcast: func(string, interface{}) {},
	}
	InitGameState(gs)

	if gs.Players == nil {
		t.Error("Players should be initialized")
	}
	if gs.Monsters == nil {
		t.Error("Monsters should be initialized")
	}
	if gs.Bullets == nil {
		t.Error("Bullets should be initialized")
	}
	if gs.Props == nil {
		t.Error("Props should be initialized")
	}
	if gs.Map == nil {
		t.Error("Map should be loaded")
	}
	if gs.Walls == nil {
		t.Error("Walls should be initialized")
	}
	if gs.State != GameStateWaiting {
		t.Errorf("State = %v, want waiting", gs.State)
	}
	if gs.LobbyEndsAt != 0 {
		t.Error("LobbyEndsAt should be 0 in waiting state")
	}
}

func TestPlayerAdd(t *testing.T) {
	gs := newTestGameState()

	gs.PlayerAdd("p1", "Alice", "Brock Zeus")
	if len(gs.Players) != 1 {
		t.Errorf("Players count = %v, want 1", len(gs.Players))
	}

	p := gs.Players["p1"]
	if p == nil {
		t.Fatal("Player p1 not found")
	}
	if p.Name != "Alice" {
		t.Errorf("Name = %v, want Alice", p.Name)
	}
	if p.Lives != p.MaxLives {
		t.Errorf("Lives = %v, want %v", p.Lives, p.MaxLives)
	}
	if p.HeroName == "" {
		t.Error("HeroName should be set")
	}
}

func TestPlayerAddTeamMode(t *testing.T) {
	gs := newTestGameState()
	gs.Mode = ModeTeamDeathmatch

	gs.PlayerAdd("p1", "Alice", "")
	p := gs.Players["p1"]
	if p.Team != "Red" {
		t.Errorf("Team = %v, want Red (default)", p.Team)
	}
}

func TestPlayerRemove(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("p1", "Alice", "")
	gs.PlayerRemove("p1")

	if len(gs.Players) != 0 {
		t.Errorf("Players count = %v, want 0", len(gs.Players))
	}
}

func TestPlayerRemoveNonexistent(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerRemove("nonexistent") // should not panic
}

func TestPlayerPushAction(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerPushAction(Action{PlayerId: "p1", Type: "move", Ts: 100, Value: &MoveValue{X: 1, Y: 0}})

	if len(gs.Actions) != 1 {
		t.Errorf("Actions count = %v, want 1", len(gs.Actions))
	}
}

func TestEffectiveMovementSpeedUsesEachModifierOnce(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("p1", "Runner", "Needle")
	p := gs.Players["p1"]
	now := int64(10_000)
	p.Speed = 100
	p.HasteUntil = now + 1
	p.LunarSpeedUntil = now + 1
	p.SlowUntil = now + 1
	p.SlowMultiplier = .60

	want := 100 * 1.22 * 1.15 * .60
	if got := EffectiveMovementSpeed(p, now); math.Abs(got-want) > .0001 {
		t.Fatalf("effective movement speed = %.4f, want %.4f", got, want)
	}
}

func TestEffectiveMovementSpeedSlowsInsidePassableVineZone(t *testing.T) {
	now := time.Now().UnixMilli()
	p := &player.Player{Speed: 120}
	mapValue := &gamemap.GameMap{Collisions: []*geometry.WallTile{
		{MinX: 100, MinY: 100, MaxX: 140, MaxY: 140, Type: "thorn_vine"},
	}}
	if got := EffectiveMovementSpeedAt(p, now, mapValue, 120, 120); math.Abs(got-81.6) > .001 {
		t.Fatalf("thorn vine speed = %.2f, want 81.60", got)
	}
	if got := EffectiveMovementSpeedAt(p, now, mapValue, 80, 120); math.Abs(got-120) > .001 {
		t.Fatalf("outside thorn vine speed = %.2f, want 120", got)
	}
}

func TestPlayerMovementAppliesPassableVineSlowdown(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	vine := &geometry.WallTile{MinX: 80, MinY: 80, MaxX: 120, MaxY: 120, Type: "thorn_vine"}
	gs.Map = &gamemap.GameMap{WidthInPixels: 400, HeightInPixels: 240, Collisions: []*geometry.WallTile{vine}}
	gs.Walls = geometry.NewSpatialHash(float64(TileSize))
	gs.Walls.Insert(vine)
	p := &player.Player{
		CircleBody: geometry.CircleBody{X: 100, Y: 100, Radius: 12},
		PlayerId:   "player",
		Lives:      1,
		MaxLives:   1,
		Speed:      120,
		MoveX:      1,
	}
	gs.Players = map[string]*player.Player{p.PlayerId: p}

	gs.updatePlayerMovement(time.Second / 60)

	if math.Abs(p.X-(100+120*.68/60)) > .001 {
		t.Fatalf("thorn vine movement x = %.3f, want %.3f", p.X, 100+120*.68/60)
	}
}

func TestAbilityAppliesCooldownAndShield(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("p1", "Tank", "Wukong Mico")
	p := gs.Players["p1"]
	gs.playerAbility("p1", 10_000, "secondary")
	if p.ShieldUntil != 14_000 {
		t.Fatalf("ShieldUntil = %d, want 14000", p.ShieldUntil)
	}
	gs.playerAbility("p1", 11_000, "secondary")
	if p.ShieldUntil != 14_000 {
		t.Fatalf("cooldown allowed duplicate shield: %d", p.ShieldUntil)
	}
}

func TestAbilityActionIsProcessed(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("p1", "Alice", "Needle")
	before := time.Now().UnixMilli()
	gs.PlayerPushAction(Action{PlayerId: "p1", Type: "ability", Ts: 10_000, Value: &AbilityValue{Slot: "secondary"}})
	gs.updatePlayers()
	processedAt := gs.Players["p1"].LastSecondaryAt
	if processedAt < before || processedAt > time.Now().UnixMilli() {
		t.Fatalf("ability action did not use authoritative server time: %d", processedAt)
	}
}

func TestGameStatePlayerMove(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("p1", "Alice", "")
	p := gs.Players["p1"]
	startX := p.X

	gs.playerMove("p1", 100, 1, 0)

	if p.Ack != 100 {
		t.Errorf("Ack = %v, want 100", p.Ack)
	}
	_ = startX // position may be adjusted by wall collision
}

func TestMovementMatchesLocalEnginePixelsPerSecond(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("p1", "Alice", "Needle")
	p := gs.Players["p1"]
	p.X, p.Y = 256, 256

	gs.playerMove("p1", 100, 1, 0)
	gs.updatePlayerMovement()

	want := 256.0 + p.Speed/60.0
	if math.Abs(p.X-want) > .01 {
		t.Fatalf("x = %.3f, want %.3f (%.0f px/s at 60 Hz)", p.X, want, p.Speed)
	}
}

func TestMovementUsesElapsedServerTimeAfterDelayedTick(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("p1", "Alice", "Needle")
	p := gs.Players["p1"]
	p.X, p.Y = 256, 256

	gs.playerMove("p1", 100, 1, 0)
	gs.updatePlayerMovement(100 * time.Millisecond)

	want := 256.0 + p.Speed*0.1
	if math.Abs(p.X-want) > .01 {
		t.Fatalf("x = %.3f, want %.3f after a 100ms tick (%.0f px/s)", p.X, want, p.Speed)
	}
}

func TestDelayedTickDoesNotApplyNewDirectionRetroactively(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("p1", "Alice", "Needle")
	p := gs.Players["p1"]
	p.X, p.Y = 256, 256

	gs.PlayerPushAction(Action{PlayerId: "p1", Type: "move", Ts: 100, Value: &MoveValue{X: 0, Y: -1}})
	gs.UpdateWithDelta(time.Second / 60)
	beforeTurnX, beforeTurnY := p.X, p.Y

	gs.PlayerPushAction(Action{PlayerId: "p1", Type: "move", Ts: 200, Value: &MoveValue{X: -1, Y: 0}})
	gs.UpdateWithDelta(100 * time.Millisecond)

	if p.X < beforeTurnX-p.Speed/60*1.1 {
		t.Fatalf("delayed direction change moved left by %.2f px, want at most one tick", beforeTurnX-p.X)
	}
	if p.Y >= beforeTurnY {
		t.Fatalf("delayed tick did not preserve the previous movement direction: y=%.2f before=%.2f", p.Y, beforeTurnY)
	}
}

func TestPlayerMovementUsesCompactSpeedAtRuntimeScale(t *testing.T) {
	hero := GetHeroByName("Needle")
	player := hero.CreatePlayer("p1", "Alice", 0, 0)
	if player.Speed != float64(hero.Speed)*RuntimeMovementSpeedScale {
		t.Fatalf("player speed = %.2f, want %.2f", player.Speed, float64(hero.Speed)*RuntimeMovementSpeedScale)
	}
}

func TestDirectionChangeKeepsMovementContinuous(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("p1", "Alice", "")
	p := gs.Players["p1"]
	p.X, p.Y = 256, 256

	gs.playerMove("p1", 100, 1, 0)
	gs.updatePlayerMovement()
	afterMovingRight := p.X

	gs.playerMove("p1", 101, -1, 0)
	gs.updatePlayerMovement()

	if p.X >= afterMovingRight {
		t.Fatalf("player did not immediately move left during a 180-degree turn: x = %.2f, previous %.2f", p.X, afterMovingRight)
	}
}

func TestGameplayTempoUsesCatalogAttackAndProjectilePacing(t *testing.T) {
	hero := GetHeroByName("Needle")
	p := hero.CreatePlayer("p1", "Alice", 100, 100)
	if p.Speed != float64(hero.Speed)*RuntimeMovementSpeedScale {
		t.Fatalf("player speed = %.2f, want %.2f", p.Speed, float64(hero.Speed)*RuntimeMovementSpeedScale)
	}
	if p.AttackRate != hero.AttackRate {
		t.Fatalf("attack rate = %d, want catalog rate %d without a hidden global multiplier", p.AttackRate, hero.AttackRate)
	}
	if p.ReloadTime != hero.ReloadTime {
		t.Fatalf("reload time = %d, want catalog reload %d without a hidden global multiplier", p.ReloadTime, hero.ReloadTime)
	}

	gs := newTestGameState()
	shot := gs.spawnAttackBullet(p, 0, "test", 1, p.BulletSpd, 4, 500, 0, false, false)
	if shot.Speed != float64(hero.BulletSpeed)*RuntimeProjectileSpeedScale {
		t.Fatalf("projectile speed = %.2f, want %.2f", shot.Speed, float64(hero.BulletSpeed)*RuntimeProjectileSpeedScale)
	}
}

func TestResetPlayerMatchStateUsesCatalogCadenceAcrossRoster(t *testing.T) {
	gs := newTestGameState()
	for _, hero := range Heroes {
		p := hero.CreatePlayer("reset-"+hero.Name, "Reset", 100, 100)
		p.AttackRate = 1
		p.ReloadTime = 1

		gs.resetPlayerMatchState(p)

		if p.AttackRate != hero.AttackRate || p.ReloadTime != hero.ReloadTime {
			t.Fatalf("%s reset cadence = %d/%d, want catalog %d/%d", hero.Name, p.AttackRate, p.ReloadTime, hero.AttackRate, hero.ReloadTime)
		}
	}
}

func TestLobbyAllowsMovementAndStartKeepsHumanPosition(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("human", "Human", "Needle")
	gs.startLobby()
	p := gs.Players["human"]
	p.X, p.Y = 256, 256
	gs.playerMove("human", 100, 1, 0)
	gs.updatePlayerMovement()
	if p.X <= 256 {
		t.Fatalf("lobby movement did not advance player: x=%.2f", p.X)
	}
	beforeX, beforeY := p.X, p.Y
	gs.startGame()
	if p.X != beforeX || p.Y != beforeY {
		t.Fatalf("game start teleported human from %.2f,%.2f to %.2f,%.2f", beforeX, beforeY, p.X, p.Y)
	}
}

func TestScreenAngleUsesIsometricWorldProjection(t *testing.T) {
	angle := math.Pi / 4
	want := math.Atan2(math.Sin(angle)/.66, math.Cos(angle))
	if got := worldAngleFromScreen(angle); math.Abs(got-want) > 1e-9 {
		t.Fatalf("world angle = %.6f, want %.6f", got, want)
	}
}

func TestGameStatePlayerMoveNonexistent(t *testing.T) {
	gs := newTestGameState()
	gs.playerMove("nonexistent", 100, 1, 0) // should not panic
}

func TestGameStatePlayerMoveZeroDirection(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("p1", "Alice", "")
	p := gs.Players["p1"]
	startX := p.X

	gs.playerMove("p1", 100, 0, 0)
	if p.X != startX {
		t.Errorf("Move(0,0) changed X to %v", p.X)
	}
}

func TestPlayerRotate(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("p1", "Alice", "")

	gs.playerRotate("p1", 100, 1.5)
	want := quantizeAttackAngle(worldAngleFromScreen(1.5))
	if math.Abs(gs.Players["p1"].Rotation-want) > 1e-9 {
		t.Errorf("Rotation = %v, want %v", gs.Players["p1"].Rotation, want)
	}
}

func TestPlayerShoot(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("p1", "Alice", "Brock Zeus")

	gs.playerShoot("p1", 1000, 0)
	if len(gs.Bullets) != 1 {
		t.Fatalf("Bullets = %v, want 1", len(gs.Bullets))
	}

	shot := gs.Bullets[0]
	if shot.PlayerId != "p1" {
		t.Errorf("Shot owner = %v, want p1", shot.PlayerId)
	}
	if shot.Kind != "zeus_lightning" {
		t.Errorf("Shot kind = %v, want zeus_lightning", shot.Kind)
	}
}

func TestHeroCombatProfiles(t *testing.T) {
	want := map[string]struct {
		speed  int
		damage int
		rate   int64
	}{
		"Needle":     {13, 60, 420},
		"Brock Zeus": {12, 85, 520},
		"Katty":      {14, 55, 520},
	}
	for name, expected := range want {
		hero := GetHeroByName(name)
		if hero == nil || hero.Speed != expected.speed || hero.AttackDamage != expected.damage || hero.AttackRate != expected.rate {
			t.Fatalf("%s profile = %#v, want speed=%d damage=%d rate=%d", name, hero, expected.speed, expected.damage, expected.rate)
		}
	}
}

func TestAmmoIsServerAuthoritativeAndReloadsSequentially(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("p1", "Alice", "Brock Zeus")
	p := gs.Players["p1"]
	p.X, p.Y = 1200, 1200

	gs.playerShoot("p1", 1_000, 0)
	gs.playerShoot("p1", 2_000, 0)
	gs.playerShoot("p1", 3_000, 0)
	gs.playerShoot("p1", 3_100, 0)
	if p.Ammo != 0 {
		t.Fatalf("ammo after three accepted attacks = %d, want 0", p.Ammo)
	}
	if len(gs.Bullets) != 3 {
		t.Fatalf("projectiles after firing with empty ammo = %d, want 3", len(gs.Bullets))
	}

	// Reload uses the catalog value directly. Brock's first shell returns
	// exactly one catalog reload interval after the first accepted shot.
	firstReloadAt := int64(1_000) + p.ReloadTime
	gs.reloadAmmo(p, firstReloadAt-1)
	if p.Ammo != 0 {
		t.Fatalf("ammo reloaded early: %d", p.Ammo)
	}
	gs.reloadAmmo(p, firstReloadAt)
	if p.Ammo != 1 {
		t.Fatalf("ammo after first reload = %d, want 1", p.Ammo)
	}
	secondReloadAt := firstReloadAt + p.ReloadTime
	gs.reloadAmmo(p, secondReloadAt-1)
	if p.Ammo != 1 {
		t.Fatalf("second ammo reloaded early: %d", p.Ammo)
	}
	gs.reloadAmmo(p, secondReloadAt)
	if p.Ammo != 2 {
		t.Fatalf("ammo after second reload = %d, want 2", p.Ammo)
	}
}

func TestShadowShortAimStillFiresSporeProjectile(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("needle", "Needle", "Needle")
	gs.State = GameStateGame
	p := gs.Players["needle"]
	p.X, p.Y = 1200, 1200
	gs.playerShoot("needle", 1000, 0, 40)
	if p.X != 1200 || len(gs.Bullets) != 1 || gs.Bullets[0].Kind != "spore" {
		t.Fatalf("Needle short aim position=%.1f bullets=%#v", p.X, gs.Bullets)
	}
}

func TestMeleeBasicDealsDamageWithoutProjectile(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("p1", "Mico", "Wukong Mico")
	gs.PlayerAdd("p2", "Target", "Needle")
	source, target := gs.Players["p1"], gs.Players["p2"]
	target.X, target.Y = source.X+60, source.Y
	before := target.Lives
	gs.playerShoot("p1", 1000, 0)
	if len(gs.Bullets) != 0 {
		t.Fatalf("slam created %d projectiles", len(gs.Bullets))
	}
	if target.Lives >= before {
		t.Fatal("slam did not damage target")
	}
}

func TestPlayerShootRateLimit(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("p1", "Alice", "Brock Zeus")

	gs.playerShoot("p1", 1000, 0)
	gs.playerShoot("p1", 1050, 0) // too fast (50ms < 800ms)

	if len(gs.Bullets) != 1 {
		t.Errorf("Bullets count = %v, want 1 (rate limited)", len(gs.Bullets))
	}
}

func TestPlayerShootRecycle(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("p1", "Alice", "Brock Zeus")

	gs.playerShoot("p1", 1000, 0)
	gs.Bullets[0].Active = false

	gs.playerShoot("p1", 2500, 0)
	if len(gs.Bullets) != 1 {
		t.Errorf("Bullets count = %v, want 1 (recycled)", len(gs.Bullets))
	}
	if !gs.Bullets[0].Active {
		t.Error("Recycled bullet should be active")
	}
}

func TestPlayerShootNotInGame(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateLobby
	gs.PlayerAdd("p1", "Alice", "")

	gs.playerShoot("p1", 1000, 0)
	if len(gs.Bullets) != 0 {
		t.Error("should not shoot in lobby")
	}
}

func TestSetPlayersActive(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("p1", "Alice", "")
	gs.PlayerAdd("p2", "Bob", "")
	gs.Players["p1"].FlyingUntil = time.Now().UnixMilli() + 1_000
	gs.Players["p1"].FlightSpeedMultiplier = 1.6

	gs.setPlayersActive(true)
	for _, p := range gs.Players {
		if p.Lives != p.MaxLives {
			t.Errorf("Player Lives = %v, want %v", p.Lives, p.MaxLives)
		}
		if p.Kills != 0 {
			t.Errorf("Player Kills = %v, want 0", p.Kills)
		}
		if p.FlyingUntil != 0 || p.FlightSpeedMultiplier != 0 {
			t.Errorf("Player flight state survived match reset: until=%v multiplier=%.2f", p.FlyingUntil, p.FlightSpeedMultiplier)
		}
	}

	gs.setPlayersActive(false)
	for _, p := range gs.Players {
		if p.Lives != 0 {
			t.Errorf("Player Lives = %v, want 0", p.Lives)
		}
	}
}

func TestSetPlayersActiveStartsEveryPlayerWithFreshMatchAbilityState(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("p1", "Alice", "Katty")
	p := gs.Players["p1"]

	p.MaxLives, p.BaseMaxLives, p.HealthBoosts = 900, 640, 4
	p.Speed, p.PowerCores, p.DamageMultiplier = 999, 3, 1.35
	p.ShieldHP, p.ShieldStacks, p.Marks = 300, 4, 2
	p.SuperCharge, p.Heat, p.AttackPulse, p.SuperPulse, p.GadgetPulse = 12, 80, 7, 8, 9
	p.Dodges, p.Souls, p.Deflect, p.Evolution = 3, 2, 1, 4
	p.LumiFlowers, p.SuppressedRage, p.MicoRage = 3, 40, 5
	p.KazeCritReady, p.KazeCombo, p.GadgetArmed = true, 2, true
	p.GadgetCharges, p.Ammo, p.NextAmmoAt = 0, 0, 123
	p.FocusStartedAt, p.FocusCharge = 456, 70
	p.LastShootAt, p.LastPrimaryAt, p.LastSecondaryAt = 100, 200, 300
	p.LastAbilityTick, p.LastAbilityID, p.LastAbilityOK = 400, "old", true
	p.ShieldStackUntil, p.PoisonUntil, p.PoisonTickAt, p.PoisonBy = 1, 2, 3, "enemy"
	p.HeatUntil, p.ShieldUntil, p.StealthUntil, p.StunUntil = 4, 5, 6, 7
	p.CastUntil, p.ChannelUntil, p.VineUntil, p.VortexUntil = 8, 9, 10, 11
	p.FlyingUntil, p.FlightSpeedMultiplier = 12, 1.6
	p.BlindUntil, p.HasteUntil, p.LunarSpeedUntil, p.LunarDamageUntil = 13, 14, 15, 16
	p.LunarShield, p.SlowUntil, p.SlowMultiplier = true, 17, .4
	p.KazeComboUntil, p.StoneArmorUntil, p.RevealedUntil = 18, 19, 20
	p.RegenCarry, p.LastDamageAt, p.LastRegenAt = 21, 22, 23
	p.RespawnAt, p.RespawnCount = 24, 3
	p.LastContactAt, p.LastContactBy, p.HitImpulseX, p.HitImpulseY = 25, "enemy", 1, 1

	gs.setPlayersActive(true)

	if p.Lives != 640 || p.MaxLives != 640 || p.BaseMaxLives != 640 || p.HealthBoosts != 0 {
		t.Fatalf("health state survived match reset: lives=%d max=%d base=%d boosts=%d", p.Lives, p.MaxLives, p.BaseMaxLives, p.HealthBoosts)
	}
	if p.Speed != 168 || p.PowerCores != 0 || p.DamageMultiplier != 1 {
		t.Fatalf("power-up stats survived match reset: speed=%.1f cores=%d damage=%.2f", p.Speed, p.PowerCores, p.DamageMultiplier)
	}
	if p.ShieldHP != 0 || p.ShieldStacks != 0 || p.Marks != 0 || p.SuperCharge != 0 || p.Heat != 0 {
		t.Fatalf("combat stacks survived match reset: shield=%d stacks=%d marks=%d super=%d heat=%d", p.ShieldHP, p.ShieldStacks, p.Marks, p.SuperCharge, p.Heat)
	}
	if p.AttackPulse != 0 || p.SuperPulse != 0 || p.GadgetPulse != 0 || p.Souls != 0 || p.Evolution != 0 || p.LumiFlowers != 0 || p.KazeCombo != 0 {
		t.Fatalf("ability counters survived match reset: attack=%d super=%d gadget=%d souls=%d evolution=%d flowers=%d combo=%d", p.AttackPulse, p.SuperPulse, p.GadgetPulse, p.Souls, p.Evolution, p.LumiFlowers, p.KazeCombo)
	}
	if p.GadgetCharges != 3 || p.Ammo != p.MaxAmmo || p.NextAmmoAt != 0 || p.FocusStartedAt != 0 || p.FocusCharge != 0 {
		t.Fatalf("ability resources survived match reset: gadgets=%d ammo=%d/%d next=%d focus=%d/%d", p.GadgetCharges, p.Ammo, p.MaxAmmo, p.NextAmmoAt, p.FocusStartedAt, p.FocusCharge)
	}
	if p.FlyingUntil != 0 || p.FlightSpeedMultiplier != 0 || p.GadgetArmed || p.KazeCritReady || p.LunarShield {
		t.Fatalf("temporary ability state survived match reset: flight=%d multiplier=%.2f armed=%v crit=%v lunarShield=%v", p.FlyingUntil, p.FlightSpeedMultiplier, p.GadgetArmed, p.KazeCritReady, p.LunarShield)
	}
	if p.LastShootAt != 0 || p.LastPrimaryAt != 0 || p.LastSecondaryAt != 0 || p.LastAbilityTick != 0 || p.LastAbilityID != "" || p.LastAbilityOK {
		t.Fatalf("ability cooldown state survived match reset: shoot=%d primary=%d secondary=%d tick=%d id=%q ok=%v", p.LastShootAt, p.LastPrimaryAt, p.LastSecondaryAt, p.LastAbilityTick, p.LastAbilityID, p.LastAbilityOK)
	}
	if p.RegenCarry != 0 || p.LastDamageAt != 0 || p.LastRegenAt != 0 || p.RespawnAt != 0 || p.RespawnCount != 0 || p.LastContactAt != 0 || p.LastContactBy != "" || p.HitImpulseX != 0 || p.HitImpulseY != 0 {
		t.Fatalf("match history survived reset: regen=%.1f damage=%d regenAt=%d respawn=%d/%d contact=%d/%q impulse=%.1f/%.1f", p.RegenCarry, p.LastDamageAt, p.LastRegenAt, p.RespawnAt, p.RespawnCount, p.LastContactAt, p.LastContactBy, p.HitImpulseX, p.HitImpulseY)
	}
}

func TestPlayerAbilityClampsGadgetChargesToProfileCapacity(t *testing.T) {
	p := &player.Player{GadgetCharges: MaxGadgetCharges + 7}

	normalizeGadgetCharges(p)

	if p.GadgetCharges != MaxGadgetCharges {
		t.Fatalf("gadget charges = %d, want profile capacity %d", p.GadgetCharges, MaxGadgetCharges)
	}
}

func TestStartGameClearsMatchAbilityRuntime(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("p1", "Alice", "Katty")
	gs.State = GameStateLobby
	gs.Bullets = []*bullet.Bullet{{}}
	gs.ScheduledShots = []*ScheduledShot{{}}
	gs.DamageZones = []*DamageZone{{}}
	gs.PendingMandySupers = []*PendingMandySuper{{}}
	gs.HeroZones = []*HeroZone{{}}
	gs.Effects = []*BattleEffect{{}}
	gs.DelayedEffects = []*DelayedBattleEffect{{}}
	gs.LightningStrikes = []*LightningStrike{{}}
	gs.Skyfalls = []*Skyfall{{}}
	gs.TemporaryWalls = map[*geometry.WallTile]int64{&geometry.WallTile{}: 1}
	gs.KattyPaintStacks["p1"] = map[string]int{"target": 2}
	gs.KattyPaintUntil["p1"] = map[string]int64{"target": 1}
	gs.LightMarkedUntil["target"] = 1
	gs.AbilityTargets["p1"] = "target"
	gs.CombatEvents = []CombatEvent{{ID: 9}}
	gs.NextCombatEventID = 9
	gs.createTemporaryRock(200, 200, time.Now().Add(time.Minute).UnixMilli())

	gs.startGame()

	if len(gs.Bullets) != 0 || len(gs.ScheduledShots) != 0 || len(gs.DamageZones) != 0 || len(gs.PendingMandySupers) != 0 || len(gs.HeroZones) != 0 || len(gs.Effects) != 0 || len(gs.DelayedEffects) != 0 || len(gs.LightningStrikes) != 0 || len(gs.Skyfalls) != 0 {
		t.Fatalf("old ability runtime survived match start: bullets=%d scheduled=%d damage=%d pending=%d zones=%d effects=%d delayed=%d lightning=%d skyfalls=%d", len(gs.Bullets), len(gs.ScheduledShots), len(gs.DamageZones), len(gs.PendingMandySupers), len(gs.HeroZones), len(gs.Effects), len(gs.DelayedEffects), len(gs.LightningStrikes), len(gs.Skyfalls))
	}
	if len(gs.TemporaryWalls) != 0 || len(gs.KattyPaintStacks) != 0 || len(gs.KattyPaintUntil) != 0 || len(gs.LightMarkedUntil) != 0 || len(gs.AbilityTargets) != 0 || len(gs.CombatEvents) != 0 || gs.NextCombatEventID != 0 {
		t.Fatalf("old ability maps survived match start: walls=%d paint=%d/%d marks=%d targets=%d events=%d next=%d", len(gs.TemporaryWalls), len(gs.KattyPaintStacks), len(gs.KattyPaintUntil), len(gs.LightMarkedUntil), len(gs.AbilityTargets), len(gs.CombatEvents), gs.NextCombatEventID)
	}
	for _, wall := range gs.Map.Collisions {
		if wall != nil && wall.Type == "temporary-rock" {
			t.Fatal("temporary ability wall survived match start")
		}
	}
}

func TestSetPlayersTeamsRandomly(t *testing.T) {
	gs := newTestGameState()
	gs.Mode = ModeTeamDeathmatch
	for i := 0; i < 4; i++ {
		gs.PlayerAdd("p"+string(rune('0'+i)), "Player", "")
	}

	gs.setPlayersTeamsRandomly()

	blueCount := 0
	redCount := 0
	for _, p := range gs.Players {
		switch p.Team {
		case "Blue":
			blueCount++
		case "Red":
			redCount++
		}
	}

	if blueCount != 2 || redCount != 2 {
		t.Errorf("Teams: Blue=%v Red=%v, want 2/2", blueCount, redCount)
	}
}

func TestCountActivePlayers(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("p1", "Alice", "")
	gs.PlayerAdd("p2", "Bob", "")
	gs.PlayerAdd("p3", "Eve", "")

	gs.setPlayersActive(true)
	if gs.countActivePlayers() != 3 {
		t.Errorf("Active = %v, want 3", gs.countActivePlayers())
	}

	gs.Players["p1"].Lives = 0
	if gs.countActivePlayers() != 2 {
		t.Errorf("Active = %v, want 2", gs.countActivePlayers())
	}
}

func TestGetWinningPlayer(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("p1", "Alice", "")
	gs.PlayerAdd("p2", "Bob", "")

	gs.setPlayersActive(true)
	winner := gs.getWinningPlayer()
	if winner == nil {
		t.Error("should have a winner")
	}

	gs.Players["p1"].Lives = 0
	gs.Players["p2"].Lives = 0
	winner = gs.getWinningPlayer()
	if winner != nil {
		t.Error("no winner when all dead")
	}
}

func TestGetWinningTeam(t *testing.T) {
	gs := newTestGameState()
	gs.Mode = ModeTeamDeathmatch

	gs.PlayerAdd("p1", "Alice", "")
	gs.PlayerAdd("p2", "Bob", "")
	gs.Players["p1"].Team = "Red"
	gs.Players["p2"].Team = "Red"

	// All Red alive, no Blue
	team := gs.getWinningTeam()
	if team != "Red" {
		t.Errorf("Winning team = %v, want Red", team)
	}

	// Both teams alive
	gs.Players["p2"].Team = "Blue"
	team = gs.getWinningTeam()
	if team != "" {
		t.Errorf("Winning team = %v, want empty (both alive)", team)
	}

	// Only Blue alive
	gs.Players["p1"].Lives = 0
	team = gs.getWinningTeam()
	if team != "Blue" {
		t.Errorf("Winning team = %v, want Blue", team)
	}
}

func TestPropsClear(t *testing.T) {
	gs := newTestGameState()
	gs.Props = []*prop.Prop{prop.NewProp("health_boost", 100, 100, 12)}
	gs.propsClear()

	if len(gs.Props) != 0 {
		t.Errorf("Props count = %v, want 0", len(gs.Props))
	}
}

func TestMonstersAdd(t *testing.T) {
	gs := newTestGameState()
	gs.monstersAdd(5)

	if len(gs.Monsters) != 5 {
		t.Errorf("Monsters count = %v, want 5", len(gs.Monsters))
	}
	for _, m := range gs.Monsters {
		if !m.IsAlive() {
			t.Error("new monster should be alive")
		}
	}
}

func TestMonstersAddDistributesEightMonstersAcrossArenaRegions(t *testing.T) {
	gs := newTestGameState()
	mapData, err := gamemap.LoadMap("arena")
	if err != nil {
		t.Fatalf("load arena: %v", err)
	}
	gs.Map = mapData
	gs.monstersAdd(8)

	if len(gs.Monsters) != 8 {
		t.Fatalf("monsters = %d, want 8", len(gs.Monsters))
	}

	regions := make(map[[2]int]bool)
	for _, m := range gs.Monsters {
		if m == nil {
			t.Fatal("spawned nil monster")
		}
		region := [2]int{int(m.X / (gs.Map.WidthInPixels / 4)), int(m.Y / (gs.Map.HeightInPixels / 2))}
		regions[region] = true
	}
	if len(regions) != 8 {
		t.Fatalf("monster regions = %d, want 8 distinct regions", len(regions))
	}
}

func TestMonstersAddKeepsMonstersSeparated(t *testing.T) {
	gs := newTestGameState()
	mapData, err := gamemap.LoadMap("arena")
	if err != nil {
		t.Fatalf("load arena: %v", err)
	}
	gs.Map = mapData
	gs.monstersAdd(8)

	monsters := make([]*monster.Monster, 0, len(gs.Monsters))
	for _, m := range gs.Monsters {
		monsters = append(monsters, m)
	}
	for i, first := range monsters {
		for _, second := range monsters[i+1:] {
			if distance := math.Hypot(first.X-second.X, first.Y-second.Y); distance < monsterSpawnClearance {
				t.Fatalf("monsters spawned too close: %.1f, want at least %.1f", distance, monsterSpawnClearance)
			}
		}
	}
}

func TestMonstersClear(t *testing.T) {
	gs := newTestGameState()
	gs.monstersAdd(3)
	gs.monstersClear()

	if len(gs.Monsters) != 0 {
		t.Errorf("Monsters count = %v, want 0", len(gs.Monsters))
	}
}

func TestGameStartLobby(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateWaiting
	gs.PlayerAdd("p1", "Alice", "")
	gs.PlayerAdd("p2", "Bob", "")

	gs.startLobby()
	if gs.State != GameStateLobby {
		t.Errorf("State = %v, want lobby", gs.State)
	}
	if gs.LobbyEndsAt == 0 {
		t.Error("LobbyEndsAt should be set")
	}
}

func TestMatchDoesNotSpawnLegacyHealthPickups(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateWaiting
	gs.PlayerAdd("p1", "Alice", "")

	gs.startLobby()

	if len(gs.Props) != 0 {
		t.Fatalf("lobby booster drops = %d, want 0", len(gs.Props))
	}

	gs.startGame()
	legacyCount := 0
	for _, prop := range gs.Props {
		if prop.Type == "health_crate" || prop.Type == "potion-red" {
			legacyCount++
		}
	}
	if legacyCount != 0 {
		t.Fatalf("match spawned %d legacy health pickups", legacyCount)
	}
}

func TestGameStartGame(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateLobby
	gs.PlayerAdd("p1", "Alice", "")
	gs.PlayerAdd("p2", "Bob", "")

	gs.startGame()
	if gs.State != GameStateGame {
		t.Errorf("State = %v, want game", gs.State)
	}
	if gs.GameEndsAt == 0 {
		t.Error("GameEndsAt should be set")
	}
	if len(gs.Props) != 0 {
		t.Errorf("Props = %v, want no authored health pickups", len(gs.Props))
	}
	if len(gs.Monsters) != MonstersCount {
		t.Errorf("Monsters = %v, want %v", len(gs.Monsters), MonstersCount)
	}
	for _, p := range gs.Players {
		remaining := time.Until(time.UnixMilli(p.InvulnerableUntil))
		if remaining < SpawnProtectionDuration-250*time.Millisecond {
			t.Errorf("spawn protection = %v, want about %v", remaining, SpawnProtectionDuration)
		}
	}
}

func TestSoloModeKeepsRandomMonsterPathEvenWithAuthoredMapSpawns(t *testing.T) {
	gs := newTestGameState()
	gs.Map.MonsterSpawns = []gamemap.MapMonsterSpawn{{X: 240, Y: 240}}
	gs.Monsters = make(map[string]*monster.Monster)

	gs.monstersAdd(1)

	if _, authoredID := gs.Monsters["team-bat-0"]; authoredID {
		t.Fatal("solo mode used the authored team monster spawn path")
	}
	if len(gs.Monsters) != 1 {
		t.Fatalf("solo monsters = %d, want one random monster", len(gs.Monsters))
	}
}

func TestBotsFillRoomToHalfCapacity(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("p1", "Alice", "Needle")

	gs.startGame()

	if len(gs.Players) != 4 {
		t.Fatalf("players = %d, want 4 (one human and three bots)", len(gs.Players))
	}
	bots := 0
	for _, p := range gs.Players {
		if p.IsBot {
			bots++
		}
	}
	if bots != 3 {
		t.Errorf("bots = %d, want 3", bots)
	}
}

func TestBotsNotAddedAtHalfCapacity(t *testing.T) {
	gs := newTestGameState()
	for index := 1; index <= 4; index++ {
		id := fmt.Sprintf("p%d", index)
		gs.PlayerAdd(id, id, "Needle")
	}

	gs.startGame()

	if len(gs.Players) != 4 {
		t.Fatalf("players = %d, want 4 humans only", len(gs.Players))
	}
	for _, p := range gs.Players {
		if p.IsBot {
			t.Fatal("bot added even though room was already half full")
		}
	}
}

func TestBotsAdjustWhenHumansJoinAndLeaveDuringGame(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("p1", "Alice", "Needle")
	gs.startGame()

	gs.PlayerAdd("p2", "Bob", "Brock Zeus")
	gs.PlayerAdd("p3", "Eve", "Kaze")
	gs.PlayerAdd("p4", "Max", "Mandy")
	if bots := countBots(gs); bots != 0 {
		t.Fatalf("bots after fourth human joined = %d, want 0", bots)
	}

	gs.PlayerRemove("p4")
	if bots := countBots(gs); bots != 3 {
		t.Fatalf("bots after human left = %d, want 3", bots)
	}
}

func countBots(gs *GameState) int {
	count := 0
	for _, p := range gs.Players {
		if p.IsBot {
			count++
		}
	}
	return count
}

func TestGameStartWaiting(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("p1", "Alice", "")

	gs.startWaiting()
	if gs.State != GameStateWaiting {
		t.Errorf("State = %v, want waiting", gs.State)
	}
	if gs.LobbyEndsAt != 0 || gs.GameEndsAt != 0 {
		t.Error("Timers should be cleared")
	}
}

func TestGameStartFinishedClearsFlightState(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("p1", "Alice", "Katty")
	p := gs.Players["p1"]
	p.FlyingUntil = time.Now().UnixMilli() + 1_000
	p.FlightSpeedMultiplier = 1.6

	gs.startFinished()

	if p.FlyingUntil != 0 || p.FlightSpeedMultiplier != 0 {
		t.Fatalf("finished state retained flight: until=%v multiplier=%.2f", p.FlyingUntil, p.FlightSpeedMultiplier)
	}
}

func TestUpdateWaitingToLobby(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateWaiting
	gs.PlayerAdd("p1", "Alice", "")
	gs.PlayerAdd("p2", "Bob", "")

	gs.Update()
	if gs.State != GameStateLobby {
		t.Errorf("State = %v, want lobby (2 players joined)", gs.State)
	}
}

func TestUpdateLobbyToGame(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateLobby
	gs.LobbyEndsAt = time.Now().Add(-1 * time.Second).UnixMilli() // already expired
	gs.PlayerAdd("p1", "Alice", "")
	gs.PlayerAdd("p2", "Bob", "")

	gs.Update()
	if gs.State != GameStateGame {
		t.Errorf("State = %v, want game (lobby expired)", gs.State)
	}
}

func TestUpdateLobbyToWaiting(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateLobby
	gs.LobbyEndsAt = time.Now().Add(10 * time.Second).UnixMilli()
	gs.PlayerAdd("p1", "Alice", "")

	// Remove all players
	delete(gs.Players, "p1")

	gs.Update()
	if gs.State != GameStateWaiting {
		t.Errorf("State = %v, want waiting (no players)", gs.State)
	}
}

func TestUpdateGameWin(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("p1", "Alice", "")
	gs.PlayerAdd("p2", "Bob", "")
	gs.setPlayersActive(true)

	// Kill p2
	gs.Players["p2"].Lives = 0

	gs.Update()
	if gs.State != GameStateFinished {
		t.Errorf("State = %v, want finished (winner found)", gs.State)
	}
}

func TestLethalPlayerDamageImmediatelyFinishesBattleAndReportsWinner(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("winner", "Alice", "Brock Zeus")
	gs.PlayerAdd("loser", "Bob", "Needle")
	gs.State = GameStateGame
	gs.GameEndsAt = time.Now().Add(GameDuration).UnixMilli()
	gs.setPlayersActive(true)

	var winner string
	var killedPlayer string
	gs.OnGameEnd = func(_ map[string]*player.Player, name string, _ int64) {
		winner = name
	}
	gs.OnPlayerKilled = func(playerID, _ string) {
		killedPlayer = playerID
	}

	attacker := gs.Players["winner"]
	target := gs.Players["loser"]
	gs.dealPlayerDamage(attacker, target, target.Lives)

	if gs.State != GameStateFinished {
		t.Fatalf("state = %q, want %q immediately after lethal damage", gs.State, GameStateFinished)
	}
	if winner != "Alice" {
		t.Fatalf("reported winner = %q, want Alice", winner)
	}
	if killedPlayer != "loser" {
		t.Fatalf("reported killed player = %q, want loser", killedPlayer)
	}
	if attacker.Kills != 1 {
		t.Fatalf("winner kills = %d, want 1", attacker.Kills)
	}
}

func TestAllDeadPlayersFinishBattleRegardlessOfIslandPhase(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("p1", "Alice", "Brock Zeus")
	gs.PlayerAdd("p2", "Bob", "Needle")
	gs.State = GameStateGame
	gs.GameEndsAt = time.Now().Add(GameDuration).UnixMilli()
	gs.IslandPhase = IslandPhaseHunt
	gs.setPlayersActive(true)
	gs.Players["p1"].Lives = 0
	gs.Players["p2"].Lives = 0

	var endCalls int
	gs.OnGameEnd = func(_ map[string]*player.Player, winner string, _ int64) {
		endCalls++
		if winner != "" {
			t.Fatalf("winner = %q, want empty draw winner", winner)
		}
	}

	if !gs.finishBattleIfDecided() {
		t.Fatal("all-dead battle was not marked as finished")
	}
	if gs.State != GameStateFinished {
		t.Fatalf("state = %q, want %q", gs.State, GameStateFinished)
	}
	if endCalls != 1 {
		t.Fatalf("OnGameEnd calls = %d, want 1", endCalls)
	}
}

func TestUpdateGameTimeout(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.GameEndsAt = time.Now().Add(-1 * time.Second).UnixMilli() // expired
	gs.PlayerAdd("p1", "Alice", "")
	gs.PlayerAdd("p2", "Bob", "")

	gs.Update()
	if gs.State != GameStateFinished {
		t.Errorf("State = %v, want finished (timeout)", gs.State)
	}
}

func TestUpdateGameTimeoutAwardsPlayerWithMostRemainingHealth(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("p1", "Alice", "Brock Zeus")
	gs.PlayerAdd("p2", "Bob", "Needle")
	gs.State = GameStateGame
	gs.GameEndsAt = time.Now().Add(-1 * time.Second).UnixMilli()
	gs.setPlayersActive(true)
	gs.Players["p1"].Lives = 3000
	gs.Players["p2"].Lives = 1000

	var winner string
	gs.OnGameEnd = func(_ map[string]*player.Player, name string, _ int64) {
		winner = name
	}

	gs.Update()

	if winner != "Alice" {
		t.Fatalf("timeout winner = %q, want Alice (most remaining health)", winner)
	}
}

func TestUpdateGameAwardsSoleSurvivorWhenTimerExpires(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("p1", "Alice", "")
	gs.PlayerAdd("p2", "Bob", "")
	gs.State = GameStateGame
	gs.GameEndsAt = time.Now().Add(-1 * time.Second).UnixMilli()
	gs.setPlayersActive(true)
	gs.Players["p2"].Lives = 0

	var winner string
	gs.OnGameEnd = func(_ map[string]*player.Player, name string, _ int64) {
		winner = name
	}

	gs.Update()

	if winner != "Alice" {
		t.Fatalf("winner = %q, want Alice", winner)
	}
}

func TestBulletVsPlayer(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("p1", "Alice", "")
	gs.PlayerAdd("p2", "Bob", "")

	p2 := gs.Players["p2"]
	startLives := p2.Lives
	gs.Bullets = append(gs.Bullets, bullet.NewBullet("p1", "", p2.X, p2.Y, 4, 0, "#FFF"))

	gs.updateBullets()

	if gs.Bullets[0].Active {
		t.Error("bullet should be inactive after hitting player")
	}
	if p2.Lives != startLives-1 {
		t.Errorf("p2 Lives = %v, want %v", p2.Lives, startLives-1)
	}
}

func TestPlayerHitBuildsSuperCharge(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("p1", "Alice", "Brock Zeus")
	gs.PlayerAdd("p2", "Bob", "Kaze")
	gs.State = GameStateGame

	attacker, target := gs.Players["p1"], gs.Players["p2"]
	attacker.SuperCharge = 0
	attacker.LastPrimaryAt = time.Now().UnixMilli()
	beforeCharge := attacker.SuperCharge
	gs.Bullets = append(gs.Bullets, bullet.NewBullet(attacker.PlayerId, "", target.X, target.Y, 4, 0, "#FFF"))
	gs.updateBullets()

	if attacker.SuperCharge <= beforeCharge {
		t.Fatalf("super charge before=%d after=%d, want hit-based gain", beforeCharge, attacker.SuperCharge)
	}
}

func TestPoisonMatchesLocalEngineTotalDamage(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("target", "Target", "Kaze")
	target := gs.Players["target"]
	target.PoisonUntil = time.Now().Add(5 * time.Second).UnixMilli()
	before := target.Lives
	for range 8 {
		target.PoisonTickAt = 0
		gs.updateStatuses()
	}
	if got := before - target.Lives; got != 64 {
		t.Fatalf("poison damage=%d, want total 64", got)
	}
}

func TestPoisonSpreadsToNearbyPlayer(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("source", "Source", "Needle")
	gs.PlayerAdd("near", "Near", "Needle")
	gs.PlayerAdd("far", "Far", "Needle")
	source, near, far := gs.Players["source"], gs.Players["near"], gs.Players["far"]
	source.X, source.Y, near.X, near.Y, far.X, far.Y = 100, 100, 220, 100, 300, 100
	source.PoisonUntil, source.PoisonTickAt, source.PoisonBy = time.Now().Add(4*time.Second).UnixMilli(), 0, "attacker"

	gs.updateStatuses()

	if near.PoisonUntil <= time.Now().UnixMilli() || near.PoisonBy != "attacker" {
		t.Fatalf("nearby player did not inherit poison: until=%d by=%q", near.PoisonUntil, near.PoisonBy)
	}
	if far.PoisonUntil != 0 {
		t.Fatalf("far player inherited poison: until=%d", far.PoisonUntil)
	}
}

func TestBulletVsMonster(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("p1", "Alice", "")
	gs.State = GameStateGame

	gs.Monsters["m1"] = monster.NewMonster(100, 100, 16, 512, 512, 1)
	gs.Bullets = append(gs.Bullets, bullet.NewBullet("p1", "", 100, 100, 4, 0, "#FFF"))

	gs.updateBullets()

	if _, ok := gs.Monsters["m1"]; ok {
		t.Error("monster should be removed after death")
	}
}

func TestEveryMonsterDamagePathRemovesKilledMonsterAndDropsHealth(t *testing.T) {
	tests := []struct {
		name   string
		attack func(*GameState, *player.Player)
	}{
		{
			name: "melee sector",
			attack: func(gs *GameState, source *player.Player) {
				gs.hitSector(source, 0, 120, math.Pi/2, source.AttackDmg, false)
			},
		},
		{
			name: "radial",
			attack: func(gs *GameState, source *player.Player) {
				gs.radialDamage(source.PlayerId, source.X+60, source.Y, 80, source.AttackDmg)
			},
		},
		{
			name: "mandy staff",
			attack: func(gs *GameState, source *player.Player) {
				MandyKit{}.Basic(gs, source, time.Now().UnixMilli(), 0, 0)
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			gs := newTestGameState()
			gs.PlayerAdd("source", "Source", "Mandy")
			gs.State = GameStateGame
			source := gs.Players["source"]
			source.X, source.Y = 100, 100
			source.AttackDmg = 2000
			gs.Monsters["bat"] = monster.NewMonster(160, 100, 16, 512, 512, 1000)

			tc.attack(gs, source)

			if _, alive := gs.Monsters["bat"]; alive {
				t.Fatal("killed monster remained in the authoritative state")
			}
			if len(gs.Props) != 1 || gs.Props[0].Type != "health_boost" {
				t.Fatalf("health drop = %#v, want one green health boost", gs.Props)
			}
		})
	}
}

func TestChainDamageCanJumpFromPlayerToMonster(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("source", "Source", "Needle")
	gs.PlayerAdd("first", "First", "Needle")
	gs.State = GameStateGame
	first := gs.Players["first"]
	first.X, first.Y = 100, 100
	gs.Monsters["monster"] = monster.NewMonster(230, 100, 16, 512, 512, 1000)
	before := gs.Monsters["monster"].Lives

	gs.chainDamage("source", first, 190, 1, 200)

	if got := gs.Monsters["monster"].Lives; got != before-200 {
		t.Fatalf("monster lives=%d after chain, want %d", got, before-200)
	}
}

func TestBulletVsMapBounds(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("p1", "Alice", "")

	gs.Bullets = append(gs.Bullets, bullet.NewBullet("p1", "", -10, -10, 4, 0, "#FFF"))
	gs.updateBullets()

	if gs.Bullets[0].Active {
		t.Error("bullet outside map should be inactive")
	}
}

func TestMonsterVsPlayer(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("p1", "Alice", "")
	gs.State = GameStateGame

	p1 := gs.Players["p1"]
	startLives := p1.Lives
	m := monster.NewMonster(p1.X, p1.Y, 16, 512, 512, 3)
	m.State = monster.MonsterChase
	m.TargetPlayerId = "p1"
	m.LastAttackAt = 0
	gs.Monsters["m1"] = m

	gs.updateMonsters()
	if m.State != monster.MonsterWindup {
		t.Fatalf("monster attack state = %s, want windup", m.State)
	}
	if p1.Lives != startLives {
		t.Fatalf("wind-up should not deal damage before telegraph ends: start=%d after=%d", startLives, p1.Lives)
	}

	m.AttackWindupUntil = time.Now().Add(-time.Millisecond).UnixMilli()
	gs.updateMonsters()

	if p1.Lives >= startLives {
		t.Fatalf("player should have lost life: start=%d after=%d shieldHP=%d shieldUntil=%d invulnerable=%d monster=(%.2f,%.2f) player=(%.2f,%.2f) canAttack=%v state=%s", startLives, p1.Lives, p1.ShieldHP, p1.ShieldUntil, p1.InvulnerableUntil, m.X, m.Y, p1.X, p1.Y, m.CanAttack(), m.State)
	}
}

func TestTeamDeathmatchStart(t *testing.T) {
	gs := newTestGameState()
	gs.Mode = ModeTeamDeathmatch
	gs.State = GameStateLobby
	gs.LobbyEndsAt = time.Now().Add(-1 * time.Second).UnixMilli()
	gs.PlayerAdd("p1", "Alice", "")
	gs.PlayerAdd("p2", "Bob", "")

	gs.Update()

	teams := make(map[string]int)
	for _, p := range gs.Players {
		teams[p.Team]++
	}

	if teams["Blue"]+teams["Red"] != len(gs.Players) {
		t.Error("all players should have a team")
	}
}

func TestTeamDeathmatchFillsBothTeamsWhenOnePlayerQueues(t *testing.T) {
	gs := newTestGameState()
	gs.Mode = ModeTeamDeathmatch
	gs.MaxPlayers = 6
	gs.State = GameStateLobby
	gs.LobbyEndsAt = time.Now().Add(-time.Second).UnixMilli()
	gs.PlayerAdd("p1", "Alice", "Kaze")

	gs.Update()

	bots, teams := 0, map[string]int{}
	for _, p := range gs.Players {
		if p.IsBot {
			bots++
		}
		teams[p.Team]++
	}
	if len(gs.Players) != 6 || bots != 5 {
		t.Fatalf("players=%d bots=%d, want 6 players and 5 bots", len(gs.Players), bots)
	}
	if teams["Blue"] != 3 || teams["Red"] != 3 {
		t.Fatalf("teams=%+v, want 3/3", teams)
	}
	humanTeam := gs.Players["p1"].Team
	alliedBots, enemyBots := 0, 0
	for id, p := range gs.Players {
		if id == "p1" || !p.IsBot {
			continue
		}
		if p.Team == humanTeam {
			alliedBots++
		} else {
			enemyBots++
		}
	}
	if alliedBots != 2 || enemyBots != 3 {
		t.Fatalf("one-player team composition = allied bots %d, enemy bots %d; want 2/3", alliedBots, enemyBots)
	}
}

func TestTeamDeathmatchStartUsesAuthoredNeutralSpawns(t *testing.T) {
	gs := &GameState{
		RoomName:   "team-test",
		MapName:    "team-battle",
		MaxPlayers: 2,
		Mode:       ModeTeamDeathmatch,
		Broadcast:  func(string, interface{}) {},
	}
	InitGameState(gs)
	gs.State = GameStateLobby
	gs.PlayerAdd("p1", "Alice", "Needle")
	gs.PlayerAdd("p2", "Bob", "Mandy")

	gs.startGame()

	if len(gs.Monsters) != len(gs.Map.MonsterSpawns) {
		t.Fatalf("team monsters = %d, want %d authored spawns", len(gs.Monsters), len(gs.Map.MonsterSpawns))
	}
	if len(gs.Props) != 0 {
		t.Fatalf("team pickups = %d, want no authored health pickups", len(gs.Props))
	}
	if gs.Monsters["team-bat-0"].Tier != gs.Monsters["team-bat-4"].Tier {
		t.Fatalf("mirrored monster tiers = %d/%d, want equal", gs.Monsters["team-bat-0"].Tier, gs.Monsters["team-bat-4"].Tier)
	}
}
