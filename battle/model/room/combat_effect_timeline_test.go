package room

import (
	"battle/model/game"
	"testing"
	"time"
)

func TestCombatEffectSnapshotCarriesAuthoritativeTimeline(t *testing.T) {
	state := game.NewGameState(game.GameConfig{MapName: "small", MaxPlayers: 1})
	state.State = game.GameStateGame
	state.PlayerAdd("player", "Player", "Kaze")
	state.Players["player"].X = 160
	state.Players["player"].Y = 160
	now := time.Now().UnixMilli()
	createdAt := now - 250
	expiresAt := now + 10_000
	state.Effects = []*game.BattleEffect{{
		ID: 42, Kind: "kaze_dash_telegraph", Phase: game.EffectPhaseTelegraph,
		CommandID: "dash-42", SourceID: "player", CreatedAt: createdAt, ExpiresAt: expiresAt,
		X: 160, Y: 160, ToX: 320, ToY: 160, Radius: 24,
	}}
	r := &Room{
		State:        state,
		Clients:      map[string]*Client{"player": {Id: "player"}},
		Disconnected: make(map[string]time.Time),
	}

	updates := r.prepareStateUpdates()
	if len(updates) != 1 || len(updates[0].state.Effects) != 1 {
		t.Fatalf("prepared effect snapshot = %#v, state effects=%#v, want one visible effect", updates, state.Effects)
	}
	effect := updates[0].state.Effects[0]
	if effect.CreatedAt != createdAt || effect.ExpiresAt != expiresAt {
		t.Fatalf("effect timeline = created=%d expires=%d, want %d..%d", effect.CreatedAt, effect.ExpiresAt, createdAt, expiresAt)
	}
	if effect.Life <= 0 || effect.MaxLife <= 0 || effect.MaxLife != float64(expiresAt-createdAt)/1000 {
		t.Fatalf("effect derived lifetime = life=%v max=%v, want positive and authoritative duration", effect.Life, effect.MaxLife)
	}
}
