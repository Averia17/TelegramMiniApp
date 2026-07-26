package game

import (
	"math"
	"testing"
	"time"
)

func TestNewHeroCombatKitsAreRegistered(t *testing.T) {
	want := map[string]string{
		"Fairy Mina": "cone", "Brock Zeus": "line", "Kaze": "cone",
		"Wukong Mico": "lob", "Damian": "line", "Persephone Lumi": "line",
	}
	for name, shape := range want {
		kit := CombatKitFor(name)
		if kit == nil || kit.AimShape() != shape {
			t.Fatalf("%s kit=%#v shape=%q, want %q", name, kit, kit.AimShape(), shape)
		}
	}
}

func TestFairyMinaSuperHealsAlliesButNotEnemies(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("mina", "Mina", "Fairy Mina")
	gs.PlayerAdd("ally", "Ally", "Shelly")
	gs.PlayerAdd("enemy", "Enemy", "Shelly")
	mina, ally, enemy := gs.Players["mina"], gs.Players["ally"], gs.Players["enemy"]
	mina.Team, ally.Team, enemy.Team = "pink", "pink", "blue"
	mina.X, mina.Y, ally.X, ally.Y, enemy.X, enemy.Y = 500, 500, 530, 500, 540, 500
	ally.Lives, enemy.Lives = 1000, 1000
	now := time.Now().UnixMilli()
	MinaKit{}.Super(gs, mina, now, 0, 0)
	gs.updateNewHeroSystems()
	if ally.Lives <= 1000 || enemy.Lives != 1000 {
		t.Fatalf("aura ally=%d enemy=%d, want ally healed and enemy unchanged", ally.Lives, enemy.Lives)
	}
}

func TestBrockSuperSchedulesSixWallBreakingStrikes(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("brock", "Brock", "Brock Zeus")
	p := gs.Players["brock"]
	p.X, p.Y = 400, 400
	now := time.Now().UnixMilli()
	BrockZeusKit{}.Super(gs, p, now, 0, 300)
	if len(gs.LightningStrikes) != 6 || p.ChannelUntil != now+1000 {
		t.Fatalf("strikes=%d channel=%d", len(gs.LightningStrikes), p.ChannelUntil)
	}
}

func TestKazeSuperCrossesAndStunsEnemy(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("kaze", "Kaze", "Kaze")
	gs.PlayerAdd("enemy", "Enemy", "Shelly")
	p, enemy := gs.Players["kaze"], gs.Players["enemy"]
	p.X, p.Y, enemy.X, enemy.Y = 500, 500, 650, 500
	now := time.Now().UnixMilli()
	KazeKit{}.Super(gs, p, now, 0, 0)
	if enemy.Lives != enemy.MaxLives-2500 || enemy.StunUntil != now+500 {
		t.Fatalf("enemy lives=%d stun=%d", enemy.Lives, enemy.StunUntil)
	}
}

func TestMicoJumpIsInvulnerableAndDamagesLandingArea(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("mico", "Mico", "Wukong Mico")
	gs.PlayerAdd("enemy", "Enemy", "Shelly")
	p, enemy := gs.Players["mico"], gs.Players["enemy"]
	p.X, p.Y, enemy.X, enemy.Y = 500, 500, 600, 500
	now := time.Now().UnixMilli()
	WukongMicoKit{}.Basic(gs, p, now, 0, 0)
	if p.InvulnerableUntil != now+420 || enemy.Lives >= enemy.MaxLives {
		t.Fatalf("invulnerable=%d damage=%d", p.InvulnerableUntil, enemy.MaxLives-enemy.Lives)
	}
}

func TestDamianTotemTargetsNearestEnemyAndGadgetSwaps(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("damian", "Damian", "Damian")
	gs.PlayerAdd("enemy", "Enemy", "Shelly")
	p := gs.Players["damian"]
	p.X, p.Y = 400, 400
	now := time.Now().UnixMilli()
	DamianKit{}.Super(gs, p, now, 0, 120)
	totem := gs.Totems[p.PlayerId]
	if totem == nil || math.Abs(totem.X-520) > 1 {
		t.Fatalf("totem=%#v", totem)
	}
	p.GadgetCharges = 1
	oldX := p.X
	if !gs.useNewHeroGadget(p, now+1) || math.Abs(p.X-520) > 1 || math.Abs(totem.X-oldX) > 1 {
		t.Fatalf("swap player=%.1f totem=%.1f", p.X, totem.X)
	}
}

func TestLumiRootTriggersOnceForTwoSeconds(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("lumi", "Lumi", "Persephone Lumi")
	gs.PlayerAdd("enemy", "Enemy", "Shelly")
	p, enemy := gs.Players["lumi"], gs.Players["enemy"]
	p.X, p.Y, enemy.X, enemy.Y = 400, 400, 500, 400
	now := time.Now().UnixMilli()
	PersephoneLumiKit{}.Super(gs, p, now, 0, 100)
	gs.updateNewHeroSystems()
	if enemy.StunUntil < now+1900 {
		t.Fatalf("root until=%d want about %d", enemy.StunUntil, now+2000)
	}
}
