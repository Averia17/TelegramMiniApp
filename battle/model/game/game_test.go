package game

import (
	"battle/model/bullet"
	"battle/model/monster"
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

	gs.PlayerAdd("p1", "Alice")
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
	if p.Lives != PlayerMaxLives {
		t.Errorf("Lives = %v, want %v", p.Lives, PlayerMaxLives)
	}
}

func TestPlayerAddTeamMode(t *testing.T) {
	gs := newTestGameState()
	gs.Mode = ModeTeamDeathmatch

	gs.PlayerAdd("p1", "Alice")
	p := gs.Players["p1"]
	if p.Team != "Red" {
		t.Errorf("Team = %v, want Red (default)", p.Team)
	}
}

func TestPlayerRemove(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("p1", "Alice")
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

func TestGameStatePlayerMove(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("p1", "Alice")
	p := gs.Players["p1"]
	startX := p.X

	gs.playerMove("p1", 100, 1, 0)

	if p.Ack != 100 {
		t.Errorf("Ack = %v, want 100", p.Ack)
	}
	_ = startX // position may be adjusted by wall collision
}

func TestGameStatePlayerMoveNonexistent(t *testing.T) {
	gs := newTestGameState()
	gs.playerMove("nonexistent", 100, 1, 0) // should not panic
}

func TestGameStatePlayerMoveZeroDirection(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("p1", "Alice")
	p := gs.Players["p1"]
	startX := p.X

	gs.playerMove("p1", 100, 0, 0)
	if p.X != startX {
		t.Errorf("Move(0,0) changed X to %v", p.X)
	}
}

func TestPlayerRotate(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("p1", "Alice")

	gs.playerRotate("p1", 100, 1.5)
	if gs.Players["p1"].Rotation != 1.5 {
		t.Errorf("Rotation = %v, want 1.5", gs.Players["p1"].Rotation)
	}
}

func TestPlayerShoot(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("p1", "Alice")

	gs.playerShoot("p1", 1000, 0)
	if len(gs.Bullets) != 1 {
		t.Errorf("Bullets count = %v, want 1", len(gs.Bullets))
	}

	b := gs.Bullets[0]
	if b.PlayerId != "p1" {
		t.Errorf("Bullet PlayerId = %v, want p1", b.PlayerId)
	}
	if !b.Active {
		t.Error("Bullet should be active")
	}
}

func TestPlayerShootRateLimit(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("p1", "Alice")

	gs.playerShoot("p1", 1000, 0)
	gs.playerShoot("p1", 1050, 0) // too fast (50ms < 800ms)

	if len(gs.Bullets) != 1 {
		t.Errorf("Bullets count = %v, want 1 (rate limited)", len(gs.Bullets))
	}
}

func TestPlayerShootRecycle(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("p1", "Alice")

	gs.playerShoot("p1", 1000, 0)
	gs.Bullets[0].Active = false

	gs.playerShoot("p1", 2000, 0)
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
	gs.PlayerAdd("p1", "Alice")

	gs.playerShoot("p1", 1000, 0)
	if len(gs.Bullets) != 0 {
		t.Error("should not shoot in lobby")
	}
}

func TestSetPlayersActive(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("p1", "Alice")
	gs.PlayerAdd("p2", "Bob")

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
		gs.PlayerAdd("p"+string(rune('0'+i)), "Player")
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
	gs.PlayerAdd("p1", "Alice")
	gs.PlayerAdd("p2", "Bob")
	gs.PlayerAdd("p3", "Eve")

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
	gs.PlayerAdd("p1", "Alice")
	gs.PlayerAdd("p2", "Bob")

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

	gs.PlayerAdd("p1", "Alice")
	gs.PlayerAdd("p2", "Bob")
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
	gs.PlayerAdd("p1", "Alice")
	gs.PlayerAdd("p2", "Bob")

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
	gs.PlayerAdd("p1", "Alice")
	gs.PlayerAdd("p2", "Bob")

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
}

func TestGameStartWaiting(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("p1", "Alice")

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
	gs.PlayerAdd("p1", "Alice")
	gs.PlayerAdd("p2", "Bob")

	gs.Update()
	if gs.State != GameStateLobby {
		t.Errorf("State = %v, want lobby (2 players joined)", gs.State)
	}
}

func TestUpdateLobbyToGame(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateLobby
	gs.LobbyEndsAt = time.Now().Add(-1 * time.Second).UnixMilli() // already expired
	gs.PlayerAdd("p1", "Alice")
	gs.PlayerAdd("p2", "Bob")

	gs.Update()
	if gs.State != GameStateGame {
		t.Errorf("State = %v, want game (lobby expired)", gs.State)
	}
}

func TestUpdateLobbyToWaiting(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateLobby
	gs.PlayerAdd("p1", "Alice")

	gs.Update()
	if gs.State != GameStateWaiting {
		t.Errorf("State = %v, want waiting (only 1 player)", gs.State)
	}
}

func TestUpdateGameWin(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("p1", "Alice")
	gs.PlayerAdd("p2", "Bob")
	gs.setPlayersActive(true)

	// Kill p2
	gs.Players["p2"].Lives = 0

	gs.Update()
	if gs.State != GameStateLobby {
		t.Errorf("State = %v, want lobby (winner found)", gs.State)
	}
}

func TestUpdateGameTimeout(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.GameEndsAt = time.Now().Add(-1 * time.Second).UnixMilli() // expired
	gs.PlayerAdd("p1", "Alice")
	gs.PlayerAdd("p2", "Bob")

	gs.Update()
	if gs.State != GameStateLobby {
		t.Errorf("State = %v, want lobby (timeout)", gs.State)
	}
}

func TestBulletVsPlayer(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("p1", "Alice")
	gs.PlayerAdd("p2", "Bob")

	// Place bullet right next to p2
	p2 := gs.Players["p2"]
	gs.Bullets = append(gs.Bullets, bullet.NewBullet("p1", "", p2.X, p2.Y, 4, 0, "#FFF", time.Now().UnixMilli()))

	gs.updateBullets()

	if gs.Bullets[0].Active {
		t.Error("bullet should be inactive after hitting player")
	}
	if p2.Lives != PlayerMaxLives-1 {
		t.Errorf("p2 Lives = %v, want %v", p2.Lives, PlayerMaxLives-1)
	}
}

func TestBulletVsMonster(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("p1", "Alice")

	gs.Monsters["m1"] = monster.NewMonster(100, 100, 16, 512, 512, 1)
	gs.Bullets = append(gs.Bullets, bullet.NewBullet("p1", "", 100, 100, 4, 0, "#FFF", time.Now().UnixMilli()))

	gs.updateBullets()

	if _, ok := gs.Monsters["m1"]; ok {
		t.Error("monster should be removed after death")
	}
}

func TestBulletVsMapBounds(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("p1", "Alice")

	gs.Bullets = append(gs.Bullets, bullet.NewBullet("p1", "", -10, -10, 4, 0, "#FFF", time.Now().UnixMilli()))
	gs.updateBullets()

	if gs.Bullets[0].Active {
		t.Error("bullet outside map should be inactive")
	}
}

func TestMonsterVsPlayer(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("p1", "Alice")

	// Place monster on top of player
	p1 := gs.Players["p1"]
	m := monster.NewMonster(p1.X, p1.Y, 16, 512, 512, 3)
	m.State = monster.MonsterChase
	m.TargetPlayerId = "p1"
	m.LastAttackAt = 0 // can attack
	gs.Monsters["m1"] = m

	gs.updateMonsters()

	if p1.Lives >= PlayerMaxLives {
		t.Error("player should have lost a life from monster attack")
	}
}

func TestTeamDeathmatchStart(t *testing.T) {
	gs := newTestGameState()
	gs.Mode = ModeTeamDeathmatch
	gs.State = GameStateLobby
	gs.LobbyEndsAt = time.Now().Add(-1 * time.Second).UnixMilli()
	gs.PlayerAdd("p1", "Alice")
	gs.PlayerAdd("p2", "Bob")

	gs.Update()

	teams := make(map[string]int)
	for _, p := range gs.Players {
		teams[p.Team]++
	}

	if teams["Blue"]+teams["Red"] != 2 {
		t.Error("all players should have a team")
	}
}
