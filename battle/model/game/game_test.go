package game

import (
	"battle/model/bullet"
	"battle/model/monster"
	"battle/model/player"
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

func TestBattleDurationIsFiveMinutes(t *testing.T) {
	if GameDuration != 5*time.Minute {
		t.Fatalf("game duration = %s, want 5m", GameDuration)
	}
}

func TestUpdateRegenerationUsesHeroRate(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("regen", "Regen", "Shelly")
	p := gs.Players["regen"]
	p.Lives = p.MaxLives / 2
	p.LastDamageAt = time.Now().Add(-4 * time.Second).UnixMilli()
	start := p.Lives

	for range 60 {
		gs.updateRegeneration()
	}

	want := int(float64(p.MaxLives) * p.RegenRate)
	if got := p.Lives - start; got != want {
		t.Fatalf("regenerated %d HP in one second, want %d", got, want)
	}
}

func TestConnectedBushGroupRevealsPlayersAcrossGrass(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("hidden", "Hidden", "Spark")
	gs.PlayerAdd("enemy", "Enemy", "Colt")
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
	gs.PlayerAdd("bot", "Bot", "Spark")
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

	gs.PlayerAdd("p1", "Alice", "Colt")
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

func TestAbilityAppliesCooldownAndShield(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("p1", "Tank", "Viper")
	p := gs.Players["p1"]
	gs.playerAbility("p1", 10_000, "secondary")
	if p.ShieldUntil != 12_200 {
		t.Fatalf("ShieldUntil = %d, want 12200", p.ShieldUntil)
	}
	gs.playerAbility("p1", 11_000, "secondary")
	if p.ShieldUntil != 12_200 {
		t.Fatalf("cooldown allowed duplicate shield: %d", p.ShieldUntil)
	}
}

func TestAbilityActionIsProcessed(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("p1", "Alice", "Shelly")
	before := time.Now().UnixMilli()
	gs.PlayerPushAction(Action{PlayerId: "p1", Type: "ability", Ts: 10_000, Value: &AbilityValue{Slot: "secondary"}})
	gs.updatePlayers()
	processedAt := gs.Players["p1"].LastSecondaryAt
	if processedAt < before || processedAt > time.Now().UnixMilli() {
		t.Fatalf("ability action did not use authoritative server time: %d", processedAt)
	}
}

func TestTitanSecondaryThrowsThreePrismDiscs(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("titan", "Titan", "Titan")

	gs.playerAbility("titan", 10_000, "secondary")

	active := 0
	for _, projectile := range gs.Bullets {
		if projectile.Active {
			active++
			if projectile.Kind != "boomerang" {
				t.Fatalf("Titan secondary projectile kind = %q, want boomerang", projectile.Kind)
			}
		}
	}
	if active != 3 {
		t.Fatalf("Titan secondary active projectiles = %d, want 3", active)
	}
}

func TestSparkSecondaryIsAnAttackNotOnlyAStatBuff(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("spark", "Spark", "Spark")
	p := gs.Players["spark"]
	p.X, p.Y, p.Rotation = 1200, 1200, 0
	startX := p.X

	gs.playerAbility("spark", 10_000, "secondary")

	if p.X <= startX {
		t.Fatalf("Spark secondary did not move: x = %.1f, start = %.1f", p.X, startX)
	}
	foundScythe := false
	for _, effect := range gs.Effects {
		if effect.Kind == "scythe" {
			foundScythe = true
			break
		}
	}
	if !foundScythe {
		t.Fatal("Spark secondary did not create a scythe telegraph")
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
	gs.PlayerAdd("p1", "Alice", "Shelly")
	p := gs.Players["p1"]
	p.X, p.Y = 256, 256

	gs.playerMove("p1", 100, 1, 0)
	gs.updatePlayerMovement()

	want := 256.0 + p.Speed/60.0
	if math.Abs(p.X-want) > .01 {
		t.Fatalf("x = %.3f, want %.3f (%.0f px/s at 60 Hz)", p.X, want, p.Speed)
	}
}

func TestPlayerMovementUsesSlowerGlobalPace(t *testing.T) {
	if PlayerSpeedScale != 0.70 {
		t.Fatalf("player speed scale = %.2f, want 0.70", PlayerSpeedScale)
	}
}

func TestGameplayTempoAppliesMovementAttackAndProjectilePacing(t *testing.T) {
	hero := GetHeroByName("Colt")
	p := hero.CreatePlayer("p1", "Alice", 100, 100)
	if p.Speed != hero.Speed*PlayerSpeedScale {
		t.Fatalf("player speed = %.2f, want %.2f", p.Speed, hero.Speed*PlayerSpeedScale)
	}
	if p.AttackRate != int64(math.Round(float64(hero.AttackRate)*AttackRateScale)) {
		t.Fatalf("attack rate = %d, want scaled rate from %d", p.AttackRate, hero.AttackRate)
	}
	if p.ReloadTime != int64(math.Round(float64(hero.ReloadTime)*ReloadTimeScale)) {
		t.Fatalf("reload time = %d, want scaled reload from %d", p.ReloadTime, hero.ReloadTime)
	}

	gs := newTestGameState()
	shot := gs.spawnAttackBullet(p, 0, "test", 1, hero.BulletSpeed, 4, 500, 0, false, false)
	if shot.Speed != hero.BulletSpeed*ProjectileSpeedScale {
		t.Fatalf("projectile speed = %.2f, want %.2f", shot.Speed, hero.BulletSpeed*ProjectileSpeedScale)
	}
}

func TestLobbyAllowsMovementAndStartKeepsHumanPosition(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("human", "Human", "Shelly")
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
	want := worldAngleFromScreen(1.5)
	if math.Abs(gs.Players["p1"].Rotation-want) > 1e-9 {
		t.Errorf("Rotation = %v, want %v", gs.Players["p1"].Rotation, want)
	}
}

func TestPlayerShoot(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("p1", "Alice", "Colt")

	gs.playerShoot("p1", 1000, 0)
	if len(gs.ScheduledShots) != 6 {
		t.Fatalf("Scheduled shots = %v, want 6", len(gs.ScheduledShots))
	}

	shot := gs.ScheduledShots[0]
	if shot.Owner != "p1" {
		t.Errorf("Shot owner = %v, want p1", shot.Owner)
	}
	if shot.Kind != "colt_round" {
		t.Errorf("Shot kind = %v, want colt_round", shot.Kind)
	}
}

func TestShotgunSpawnsFivePellets(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("p1", "Alice", "Shelly")
	gs.playerShoot("p1", 1000, 0)
	if len(gs.Bullets) != 5 {
		t.Fatalf("shotgun bullets = %d, want 5", len(gs.Bullets))
	}
	for _, b := range gs.Bullets {
		if b.Kind != "pellet" {
			t.Errorf("kind = %q, want pellet", b.Kind)
		}
	}
}

func TestHeroCombatProfiles(t *testing.T) {
	want := map[string]struct {
		speed  float64
		damage int
		rate   int64
	}{
		"Shelly": {250, 600, 250}, "Colt": {250, 420, 300}, "Barley": {250, 760, 350},
		"Viper": {225, 1250, 520},
		"Titan": {285, 650, 300}, "Shadow": {240, 750, 420}, "Spark": {285, 1050, 260},
	}
	for name, expected := range want {
		hero := GetHeroByName(name)
		if hero == nil || hero.Speed != expected.speed || hero.AttackDamage != expected.damage || hero.AttackRate != expected.rate {
			t.Fatalf("%s profile = %#v, want speed=%.0f damage=%d rate=%d", name, hero, expected.speed, expected.damage, expected.rate)
		}
	}
}

func TestAmmoIsServerAuthoritativeAndReloadsSequentially(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("p1", "Alice", "Colt")
	p := gs.Players["p1"]
	p.X, p.Y = 1200, 1200

	gs.playerShoot("p1", 1_000, 0)
	gs.playerShoot("p1", 1_700, 0)
	gs.playerShoot("p1", 2_400, 0)
	gs.playerShoot("p1", 3_100, 0)
	if p.Ammo != 0 {
		t.Fatalf("ammo after three accepted attacks = %d, want 0", p.Ammo)
	}
	if len(gs.Bullets) != 3 {
		t.Fatalf("projectiles after firing with empty ammo = %d, want 3", len(gs.Bullets))
	}

	gs.reloadAmmo(p, 3_099)
	if p.Ammo != 0 {
		t.Fatalf("ammo reloaded early: %d", p.Ammo)
	}
	gs.reloadAmmo(p, 3_100)
	if p.Ammo != 1 {
		t.Fatalf("ammo after first reload = %d, want 1", p.Ammo)
	}
	gs.reloadAmmo(p, 5_200)
	if p.Ammo != 2 {
		t.Fatalf("ammo after second reload = %d, want 2", p.Ammo)
	}
}

func TestShadowShortAimVaultsWithoutProjectile(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("shadow", "Shadow", "Shadow")
	gs.State = GameStateGame
	p := gs.Players["shadow"]
	p.X, p.Y = 1200, 1200
	gs.playerShoot("shadow", 1000, 0, 40)
	if p.X < 1400 {
		t.Fatalf("Shadow short aim x = %.1f, want a 210px vault", p.X)
	}
	if len(gs.Bullets) != 0 {
		t.Fatalf("short aim created %d projectiles", len(gs.Bullets))
	}
}

func TestSlamDealsDamageWithoutProjectile(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("p1", "Vulkan", "Viper")
	gs.PlayerAdd("p2", "Target", "Colt")
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
	gs.PlayerAdd("p1", "Alice", "Colt")

	gs.playerShoot("p1", 1000, 0)
	gs.playerShoot("p1", 1050, 0) // too fast (50ms < 800ms)

	if len(gs.Bullets) != 1 {
		t.Errorf("Bullets count = %v, want 1 (rate limited)", len(gs.Bullets))
	}
}

func TestPlayerShootRecycle(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("p1", "Alice", "Colt")

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

	gs.setPlayersActive(true)
	for _, p := range gs.Players {
		if p.Lives != p.MaxLives {
			t.Errorf("Player Lives = %v, want %v", p.Lives, p.MaxLives)
		}
		if p.Kills != 0 {
			t.Errorf("Player Kills = %v, want 0", p.Kills)
		}
	}

	gs.setPlayersActive(false)
	for _, p := range gs.Players {
		if p.Lives != 0 {
			t.Errorf("Player Lives = %v, want 0", p.Lives)
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

func TestPropsAdd(t *testing.T) {
	gs := newTestGameState()
	gs.propsAdd(5)

	if len(gs.Props) != 5 {
		t.Errorf("Props count = %v, want 5", len(gs.Props))
	}
	for _, p := range gs.Props {
		if !p.Active {
			t.Error("new prop should be active")
		}
		if p.Type != "potion-red" {
			t.Errorf("Prop type = %v, want potion-red", p.Type)
		}
	}
}

func TestPropsClear(t *testing.T) {
	gs := newTestGameState()
	gs.propsAdd(3)
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
	if len(gs.Props) != FlasksCount {
		t.Errorf("Props = %v, want %v", len(gs.Props), FlasksCount)
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

func TestBotsFillRoomToHalfCapacity(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("p1", "Alice", "Shelly")

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
		gs.PlayerAdd(id, id, "Shelly")
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
	gs.PlayerAdd("p1", "Alice", "Shelly")
	gs.startGame()

	gs.PlayerAdd("p2", "Bob", "Colt")
	gs.PlayerAdd("p3", "Eve", "Viper")
	gs.PlayerAdd("p4", "Max", "Titan")
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

func TestPlayerHitBuildsServerAuthoritativeSuperCharge(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("p1", "Alice", "Colt")
	gs.PlayerAdd("p2", "Bob", "Viper")
	gs.State = GameStateGame

	attacker, target := gs.Players["p1"], gs.Players["p2"]
	beforeCharge := attacker.SuperCharge
	gs.Bullets = append(gs.Bullets, bullet.NewBullet(attacker.PlayerId, "", target.X, target.Y, 4, 0, "#FFF"))
	gs.updateBullets()

	if attacker.SuperCharge-beforeCharge != 20 {
		t.Fatalf("super charge before=%d after=%d, want delta 20", beforeCharge, attacker.SuperCharge)
	}
}

func TestSparkDashHitsTargetOnlyOnce(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("spark", "Spark", "Spark")
	gs.PlayerAdd("target", "Target", "Viper")
	spark, target := gs.Players["spark"], gs.Players["target"]
	spark.X, spark.Y = 100, 100
	target.X, target.Y = 280, 100
	before := target.Lives

	gs.playerShoot("spark", 10_000, 0)

	if got := before - target.Lives; got != spark.AttackDmg {
		t.Fatalf("Spark dash damage = %d, want one hit of %d", got, spark.AttackDmg)
	}
}

func TestViperSlamAddsSlowAndShieldStack(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("viper", "Viper", "Viper")
	gs.PlayerAdd("target", "Target", "Shelly")
	viper, target := gs.Players["viper"], gs.Players["target"]
	viper.X, viper.Y = 100, 100
	target.X, target.Y = 210, 100

	gs.playerShoot("viper", 10_000, 0)

	if viper.ShieldStacks != 1 || viper.ShieldStackUntil != 14_000 {
		t.Fatalf("Viper shield stacks=%d until=%d, want 1 until 14000", viper.ShieldStacks, viper.ShieldStackUntil)
	}
	if target.SlowUntil != 11_200 {
		t.Fatalf("target slow until=%d, want 11200", target.SlowUntil)
	}
}

func TestPoisonMatchesLocalEngineTotalDamage(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("target", "Target", "Viper")
	target := gs.Players["target"]
	target.PoisonUntil = time.Now().Add(5 * time.Second).UnixMilli()
	before := target.Lives
	for range 8 {
		target.PoisonTickAt = 0
		gs.updateStatuses()
	}
	if got := before - target.Lives; got != 640 {
		t.Fatalf("poison damage=%d, want total 640", got)
	}
}

func TestPoisonSpreadsToNearbyPlayer(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("source", "Source", "Shadow")
	gs.PlayerAdd("near", "Near", "Shelly")
	gs.PlayerAdd("far", "Far", "Shelly")
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
			if len(gs.Props) != 1 || gs.Props[0].Type != "potion-red" {
				t.Fatalf("health drop = %#v, want one red health potion", gs.Props)
			}
		})
	}
}

func TestChainDamageCanJumpFromPlayerToMonster(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("source", "Source", "Shadow")
	gs.PlayerAdd("first", "First", "Shelly")
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
