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
	"time"
)

const (
	GameStateWaiting = "waiting"
	GameStateLobby   = "lobby"
	GameStateGame    = "game"

	LobbyDuration = 10 * time.Second
	GameDuration  = 90 * time.Second

	FlasksCount   = 3
	MonstersCount = 3

	PlayerSpeed      = 1.0
	PlayerSize       = 32.0
	PlayerMaxLives   = 3
	PlayerWeaponSize = 12.0

	BulletSize  = 8.0
	BulletSpeed = 4.0
	BulletRate  = 800

	FlaskSize = 24.0
	TileSize  = 32.0
)

type GameMode string

const (
	ModeDeathmatch     GameMode = "deathmatch"
	ModeTeamDeathmatch GameMode = "team deathmatch"
)

type GameState struct {
	State       string
	RoomName    string
	MapName     string
	MaxPlayers  int
	Mode        GameMode
	LobbyEndsAt int64
	GameEndsAt  int64
	Map         *gamemap.GameMap
	Walls       *geometry.SpatialHash
	Players     map[string]*player.Player
	Monsters    map[string]*monster.Monster
	Bullets     []*bullet.Bullet
	Props       []*prop.Prop
	Actions     []Action
	Broadcast   func(msgType string, params interface{})
}

func InitGameState(gs *GameState) {
	gs.Players = make(map[string]*player.Player)
	gs.Monsters = make(map[string]*monster.Monster)
	gs.Bullets = make([]*bullet.Bullet, 0)
	gs.Props = make([]*prop.Prop, 0)
	gs.Actions = make([]Action, 0)

	m, err := gamemap.LoadMap(gs.MapName)
	if err != nil {
		fmt.Printf("Error loading map: %v\n", err)
		m = &gamemap.GameMap{WidthInPixels: 512, HeightInPixels: 512}
	}
	gs.Map = m

	gs.Walls = geometry.NewSpatialHash(float64(TileSize))
	for _, wall := range m.Collisions {
		gs.Walls.Insert(wall)
	}

	gs.State = GameStateWaiting
	gs.LobbyEndsAt = 0
}

func (gs *GameState) Update() {
	gs.updateGame()
	gs.updatePlayers()
	gs.updateMonsters()
	gs.updateBullets()
}

func (gs *GameState) updateGame() {
	switch gs.State {
	case GameStateWaiting:
		if len(gs.Players) > 1 {
			gs.startLobby()
		}
	case GameStateLobby:
		if len(gs.Players) == 1 {
			gs.startWaiting()
			return
		}
		if gs.LobbyEndsAt < time.Now().UnixMilli() {
			gs.startGame()
		}
	case GameStateGame:
		if len(gs.Players) == 1 {
			gs.onGameEnd(nil)
			gs.startWaiting()
			return
		}
		if gs.GameEndsAt < time.Now().UnixMilli() {
			gs.onGameEnd(&ServerEvent{
				Type:   "timeout",
				Params: map[string]interface{}{},
			})
			gs.startLobby()
			return
		}
		if gs.Mode == ModeDeathmatch {
			if gs.countActivePlayers() == 1 {
				p := gs.getWinningPlayer()
				if p != nil {
					gs.onGameEnd(&ServerEvent{
						Type:   "won",
						Params: map[string]interface{}{"name": p.Name},
					})
					gs.startLobby()
					return
				}
			}
		}
		if gs.Mode == ModeTeamDeathmatch {
			team := gs.getWinningTeam()
			if team != "" {
				name := "Red team"
				if team == "Blue" {
					name = "Blue team"
				}
				gs.onGameEnd(&ServerEvent{
					Type:   "won",
					Params: map[string]interface{}{"name": name},
				})
				gs.startLobby()
			}
		}
	}
}

func (gs *GameState) updatePlayers() {
	for len(gs.Actions) > 0 {
		action := gs.Actions[0]
		gs.Actions = gs.Actions[1:]

		switch action.Type {
		case "move":
			if v, ok := action.Value.(*MoveValue); ok {
				gs.playerMove(action.PlayerId, action.Ts, v.X, v.Y)
			}
		case "rotate":
			if v, ok := action.Value.(*RotateValue); ok {
				gs.playerRotate(action.PlayerId, action.Ts, v.Rotation)
			}
		case "shoot":
			if v, ok := action.Value.(*ShootValue); ok {
				gs.playerShoot(action.PlayerId, action.Ts, v.Angle)
			}
		}
	}
}

func (gs *GameState) updateMonsters() {
	for _, m := range gs.Monsters {
		if m == nil || !m.IsAlive() {
			continue
		}
		m.Update(gs.Players)

		for _, p := range gs.Players {
			if !p.IsAlive() || !m.CanAttack() || !geometry.CircleToCircle(&m.CircleBody, &p.CircleBody) {
				continue
			}
			m.Attack()
			p.Hurt()
			if !p.IsAlive() {
				gs.Broadcast("killed", map[string]interface{}{
					"killerName": "A bat",
					"killedName": p.Name,
				})
			}
		}
	}
}

func (gs *GameState) updateBullets() {
	for i := 0; i < len(gs.Bullets); i++ {
		b := gs.Bullets[i]
		if b == nil || !b.Active {
			continue
		}
		b.Move(BulletSpeed)

		for _, p := range gs.Players {
			if !p.CanBulletHurt(b.PlayerId, b.Team) || !geometry.CircleToCircle(&b.CircleBody, &p.CircleBody) {
				continue
			}
			b.Active = false
			p.Hurt()
			if !p.IsAlive() {
				killer := gs.Players[b.PlayerId]
				killerName := "Unknown"
				if killer != nil {
					killerName = killer.Name
					killer.Kills++
				}
				gs.Broadcast("killed", map[string]interface{}{
					"killerName": killerName,
					"killedName": p.Name,
				})
			}
		}

		for mid, m := range gs.Monsters {
			if m == nil || !m.IsAlive() || !geometry.CircleToCircle(&b.CircleBody, &m.CircleBody) {
				continue
			}
			b.Active = false
			m.Hurt()
			if !m.IsAlive() {
				delete(gs.Monsters, mid)
			}
		}

		if geometry.CollidesCircleWithWalls(&b.CircleBody, gs.Walls, "half") {
			b.Active = false
			continue
		}

		if gs.Map.IsCircleOutside(&b.CircleBody) {
			b.Active = false
		}
	}
}

func (gs *GameState) startWaiting() {
	gs.LobbyEndsAt = 0
	gs.GameEndsAt = 0
	gs.State = GameStateWaiting
	gs.setPlayersActive(false)
	gs.Broadcast("waiting", map[string]interface{}{})
}

func (gs *GameState) startLobby() {
	gs.LobbyEndsAt = time.Now().Add(LobbyDuration).UnixMilli()
	gs.GameEndsAt = 0
	gs.State = GameStateLobby
	gs.setPlayersActive(false)
}

func (gs *GameState) startGame() {
	gs.LobbyEndsAt = 0
	gs.GameEndsAt = time.Now().Add(GameDuration).UnixMilli()
	gs.State = GameStateGame

	if gs.Mode == ModeTeamDeathmatch {
		gs.setPlayersTeamsRandomly()
	}
	gs.setPlayersPositionRandomly()
	gs.setPlayersActive(true)
	gs.propsAdd(FlasksCount)
	gs.monstersAdd(MonstersCount)
	gs.Broadcast("start", map[string]interface{}{})
}

func (gs *GameState) onGameEnd(event *ServerEvent) {
	if event != nil {
		gs.Broadcast(event.Type, event.Params)
	}
	gs.propsClear()
	gs.monstersClear()
	gs.Broadcast("stop", map[string]interface{}{})
}

func (gs *GameState) PlayerAdd(id, name string) {
	spawner := gs.Map.GetRandomSpawner()
	p := player.NewPlayer(id, name, spawner.X+PlayerSize/2, spawner.Y+PlayerSize/2, PlayerSize/2, PlayerMaxLives, "")
	if gs.Mode == ModeTeamDeathmatch {
		p.SetTeam("Red")
	}
	gs.Players[id] = p
	gs.Broadcast("joined", map[string]interface{}{"name": p.Name})
}

func (gs *GameState) PlayerRemove(id string) {
	p := gs.Players[id]
	if p != nil {
		gs.Broadcast("left", map[string]interface{}{"name": p.Name})
	}
	delete(gs.Players, id)
}

func (gs *GameState) PlayerPushAction(action Action) {
	gs.Actions = append(gs.Actions, action)
}

func (gs *GameState) playerMove(id string, ts int64, dirX, dirY float64) {
	p := gs.Players[id]
	if p == nil || (dirX == 0 && dirY == 0) {
		return
	}
	p.Move(dirX, dirY, PlayerSpeed)

	clamped := gs.Map.ClampCircle(&p.CircleBody)
	p.X = clamped.X
	p.Y = clamped.Y

	geometry.CorrectCircleWithWalls(&p.CircleBody, gs.Walls, "full")

	p.Ack = ts

	if !p.IsAlive() {
		return
	}
	for _, pr := range gs.Props {
		if !pr.Active {
			continue
		}
		if geometry.CircleToCircle(&p.CircleBody, &pr.CircleBody) {
			switch pr.Type {
			case "potion-red":
				if !p.IsFullLives() {
					pr.Active = false
					p.Heal()
				}
			}
		}
	}
}

func (gs *GameState) playerRotate(id string, ts int64, rotation float64) {
	p := gs.Players[id]
	if p == nil {
		return
	}
	p.Rotation = rotation
}

func (gs *GameState) playerShoot(id string, ts int64, angle float64) {
	p := gs.Players[id]
	if p == nil || !p.IsAlive() || gs.State != GameStateGame {
		return
	}
	delta := ts - p.LastShootAt
	if p.LastShootAt != 0 && delta < BulletRate {
		return
	}
	p.LastShootAt = ts

	bulletX := p.X + math.Cos(angle)*PlayerWeaponSize
	bulletY := p.Y + math.Sin(angle)*PlayerWeaponSize

	found := false
	for _, b := range gs.Bullets {
		if !b.Active {
			b.Reset(p.PlayerId, p.Team, bulletX, bulletY, BulletSize, angle, p.Color, time.Now().UnixMilli())
			found = true
			break
		}
	}
	if !found {
		gs.Bullets = append(gs.Bullets, bullet.NewBullet(p.PlayerId, p.Team, bulletX, bulletY, BulletSize, angle, p.Color, time.Now().UnixMilli()))
	}
}

func (gs *GameState) setPlayersActive(active bool) {
	for _, p := range gs.Players {
		if active {
			p.Lives = p.MaxLives
			p.Kills = 0
		} else {
			p.Lives = 0
		}
	}
}

func (gs *GameState) setPlayersPositionRandomly() {
	for _, p := range gs.Players {
		spawner := gs.Map.GetRandomSpawner()
		p.X = spawner.X + PlayerSize/2
		p.Y = spawner.Y + PlayerSize/2
		p.Ack = 0
	}
}

func (gs *GameState) setPlayersTeamsRandomly() {
	ids := make([]string, 0, len(gs.Players))
	for id := range gs.Players {
		ids = append(ids, id)
	}
	ids = geometry.ShuffleStrings(ids)

	minPerTeam := len(ids) / 2
	rest := len(ids) % 2

	for i, id := range ids {
		p := gs.Players[id]
		if i < minPerTeam+rest {
			p.SetTeam("Blue")
		} else {
			p.SetTeam("Red")
		}
	}
}

func (gs *GameState) countActivePlayers() int {
	count := 0
	for _, p := range gs.Players {
		if p.IsAlive() {
			count++
		}
	}
	return count
}

func (gs *GameState) getWinningPlayer() *player.Player {
	for _, p := range gs.Players {
		if p.IsAlive() {
			return p
		}
	}
	return nil
}

func (gs *GameState) getWinningTeam() string {
	redAlive := false
	blueAlive := false
	for _, p := range gs.Players {
		if p.IsAlive() {
			if p.Team == "Red" {
				redAlive = true
			} else {
				blueAlive = true
			}
		}
	}
	if redAlive && blueAlive {
		return ""
	}
	if redAlive {
		return "Red"
	}
	return "Blue"
}

func (gs *GameState) monstersAdd(count int) {
	for i := 0; i < count; i++ {
		x := geometry.GetRandomFloat(float64(TileSize), gs.Map.WidthInPixels-float64(TileSize))
		y := geometry.GetRandomFloat(float64(TileSize), gs.Map.HeightInPixels-float64(TileSize))
		m := monster.NewMonster(x, y, PlayerSize/2, gs.Map.WidthInPixels, gs.Map.HeightInPixels, monster.MonsterLives)
		gs.Monsters[fmt.Sprintf("%d", geometry.GetRandomInt(0, 1000))] = m
	}
}

func (gs *GameState) monstersClear() {
	gs.Monsters = make(map[string]*monster.Monster)
}

func (gs *GameState) propsAdd(count int) {
	for i := 0; i < count; i++ {
		x := geometry.GetRandomFloat(float64(TileSize), gs.Map.WidthInPixels-float64(TileSize))
		y := geometry.GetRandomFloat(float64(TileSize), gs.Map.HeightInPixels-float64(TileSize))
		pr := prop.NewProp("potion-red", x, y, FlaskSize/2)
		gs.Props = append(gs.Props, pr)
	}
}

func (gs *GameState) propsClear() {
	gs.Props = make([]*prop.Prop, 0)
}
