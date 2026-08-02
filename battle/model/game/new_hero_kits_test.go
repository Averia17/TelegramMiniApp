package game

import (
	"math"
	"testing"
	"time"
)

func TestNewHeroCombatKitsAreRegistered(t *testing.T) {
	want := map[string]string{
		"Fairy Mina": "cone", "Brock Zeus": "line", "Kaze": "cone",
		"Wukong Mico": "cone", "Damian": "line", "Persephone Lumi": "line",
	}
	for name, shape := range want {
		kit := CombatKitFor(name)
		if kit == nil || kit.AimShape() != shape {
			t.Fatalf("%s kit=%#v shape=%q, want %q", name, kit, kit.AimShape(), shape)
		}
	}
}

func TestNeedleSporeSlowUsesItsDurationOnTheFirstHit(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("needle", "Needle", "Needle")
	gs.PlayerAdd("enemy", "Enemy", "Shelly")
	needle, enemy := gs.Players["needle"], gs.Players["enemy"]
	needle.X, needle.Y, enemy.X, enemy.Y = 400, 400, 500, 400
	NeedleKit{}.Basic(gs, needle, time.Now().UnixMilli(), 0, 0)
	shot := gs.Bullets[len(gs.Bullets)-1]
	shot.X, shot.Y = enemy.X, enemy.Y
	gs.updateBullets()

	remaining := enemy.SlowUntil - time.Now().UnixMilli()
	if remaining < 1800 || remaining > 2200 {
		t.Fatalf("slow remaining=%dms, want about %dms", remaining, int(NeedleSporeSlowDuration/time.Millisecond))
	}
}

func TestKazeEmpoweredSlashUsesTimeWindowInsteadOfHitCount(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("kaze", "Kaze", "Kaze")
	gs.PlayerAdd("enemy", "Enemy", "Shelly")
	p, enemy := gs.Players["kaze"], gs.Players["enemy"]
	p.X, p.Y, enemy.X, enemy.Y = 500, 500, 570, 500
	now := time.Now().UnixMilli()

	KazeKit{}.Basic(gs, p, now, 0, 0)
	firstDamage := enemy.MaxLives - enemy.Lives
	if firstDamage != int(math.Round(float64(p.AttackDmg)*KazeEmpoweredDamageMultiplier))*2 {
		t.Fatalf("first slash damage=%d, want empowered damage", firstDamage)
	}
	if p.KazeNextEmpoweredAt != now+KazeEmpowerInterval.Milliseconds() {
		t.Fatalf("next empowered slash=%d, want %d", p.KazeNextEmpoweredAt, now+KazeEmpowerInterval.Milliseconds())
	}

	enemy.Lives = enemy.MaxLives
	KazeKit{}.Basic(gs, p, now+KazeEmpowerInterval.Milliseconds()/2, 0, 0)
	if got := enemy.MaxLives - enemy.Lives; got != p.AttackDmg*2 {
		t.Fatalf("slash inside cooldown damage=%d, want normal damage=%d", got, p.AttackDmg*2)
	}
}

func TestMicoVortexUsesFixedTimedDuration(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("mico", "Mico", "Wukong Mico")
	p := gs.Players["mico"]
	now := time.Now().UnixMilli()

	WukongMicoKit{}.Super(gs, p, now, 0, 0)
	if p.VortexUntil != now+MicoVortexDuration.Milliseconds() {
		t.Fatalf("vortex until=%d, want %d", p.VortexUntil, now+MicoVortexDuration.Milliseconds())
	}
	if len(gs.Effects) == 0 || gs.Effects[len(gs.Effects)-1].ExpiresAt-gs.Effects[len(gs.Effects)-1].CreatedAt != MicoVortexDuration.Milliseconds() {
		t.Fatalf("vortex effect duration=%d, want %d", gs.Effects[len(gs.Effects)-1].ExpiresAt-gs.Effects[len(gs.Effects)-1].CreatedAt, MicoVortexDuration.Milliseconds())
	}
}

func TestSkillDurationIsCappedAtFifteenSeconds(t *testing.T) {
	if got := cappedSkillDuration(30 * time.Second); got != MaxHeroSkillDuration.Milliseconds() {
		t.Fatalf("capped duration=%dms, want %dms", got, MaxHeroSkillDuration.Milliseconds())
	}
}

func TestNeedleSuperRechargesByCooldownTimeWithoutHits(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("needle", "Needle", "Needle")
	p := gs.Players["needle"]
	now := time.Now().UnixMilli()
	p.SuperCharge = 100

	gs.playerAbility(p.PlayerId, now, "primary")
	if len(gs.HeroZones) != 1 {
		t.Fatalf("initial root cast zones=%d, want 1", len(gs.HeroZones))
	}
	if p.SuperCharge != 0 {
		t.Fatalf("super charge after cast=%d, want 0", p.SuperCharge)
	}

	cooldown := AbilityCooldownMs(p.HeroName, "primary")
	gs.playerAbility(p.PlayerId, now+cooldown-1, "primary")
	if len(gs.HeroZones) != 1 {
		t.Fatalf("root recast before cooldown zones=%d, want 1", len(gs.HeroZones))
	}
	gs.playerAbility(p.PlayerId, now+cooldown, "primary")
	if len(gs.HeroZones) != 2 {
		t.Fatalf("root recast after cooldown zones=%d, want 2", len(gs.HeroZones))
	}
}

func TestActiveSuperCooldownsAreTimeBasedAndCapped(t *testing.T) {
	for _, hero := range []string{"Needle", "Mandy", "Fairy Mina", "Brock Zeus", "Kaze", "Wukong Mico", "Damian", "Persephone Lumi"} {
		cooldown := AbilityCooldownMs(hero, "primary")
		if cooldown <= 0 || cooldown > MaxHeroSkillDuration.Milliseconds() {
			t.Fatalf("%s primary cooldown=%dms, want 1..%dms", hero, cooldown, MaxHeroSkillDuration.Milliseconds())
		}
	}
}

func TestDamianDebuffRefreshesByTimeInsteadOfStackingPerHit(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("damian", "Damian", "Damian")
	gs.PlayerAdd("enemy", "Enemy", "Shelly")
	damian, enemy := gs.Players["damian"], gs.Players["enemy"]
	damian.X, damian.Y, enemy.X, enemy.Y = 400, 400, 500, 400
	now := time.Now().UnixMilli()

	for hit := 0; hit < 2; hit++ {
		shot := gs.spawnAttackBullet(damian, 0, "damian_orb", damian.AttackDmg, damian.BulletSpd, damian.BulletSz, 640, 0, false, false)
		shot.X, shot.Y = enemy.X, enemy.Y
		gs.updateBullets()
	}
	if got := gs.DamianDebuffUntil[enemy.PlayerId]; got < now+DamianDebuffDuration.Milliseconds()-200 || got > time.Now().UnixMilli()+DamianDebuffDuration.Milliseconds()+200 {
		t.Fatalf("debuff until=%d, want a single refreshed %dms duration", got, DamianDebuffDuration.Milliseconds())
	}
}

func TestNeedleSuperDelaysRootsAndGadgetLeavesSporeCloud(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("needle", "Needle", "Needle")
	needle := gs.Players["needle"]
	needle.X, needle.Y, needle.SuperCharge = 400, 400, 100
	now := int64(1000)
	NeedleKit{}.Super(gs, needle, now, 0, 100)
	if len(gs.HeroZones) != 1 || gs.HeroZones[0].TriggerAt != now+800 {
		t.Fatalf("roots=%#v, want delayed cast", gs.HeroZones)
	}
	if !gs.useNewHeroGadget(needle, now+1) || len(gs.HeroZones) != 2 || gs.HeroZones[1].Kind != "needle_spore_cloud" {
		t.Fatalf("needle gadget zones=%#v, want spore cloud", gs.HeroZones)
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
	ally.Lives, enemy.Lives = 500, 1000
	now := time.Now().UnixMilli()
	MinaKit{}.Super(gs, mina, now, 0, 0)
	gs.updateNewHeroSystems()
	if ally.Lives <= 500 || enemy.Lives != 1000 {
		t.Fatalf("aura ally=%d enemy=%d, want ally healed and enemy unchanged", ally.Lives, enemy.Lives)
	}
}

func TestBrockSuperSchedulesThreeTimedStrikes(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("brock", "Brock", "Brock Zeus")
	p := gs.Players["brock"]
	p.X, p.Y = 400, 400
	now := time.Now().UnixMilli()
	BrockZeusKit{}.Super(gs, p, now, 0, 300)
	if len(gs.LightningStrikes) != 3 || p.ChannelUntil != now+1000 {
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
	if enemy.Lives != enemy.MaxLives-160 || enemy.StunUntil != now+500 {
		t.Fatalf("enemy lives=%d stun=%d", enemy.Lives, enemy.StunUntil)
	}
}

func TestMicoStaffAttackDamagesInFrontWithoutMovingOrGrantingInvulnerability(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("mico", "Mico", "Wukong Mico")
	gs.PlayerAdd("enemy", "Enemy", "Shelly")
	p, enemy := gs.Players["mico"], gs.Players["enemy"]
	p.X, p.Y, enemy.X, enemy.Y = 500, 500, 600, 500
	startX, startY := p.X, p.Y
	now := time.Now().UnixMilli()
	WukongMicoKit{}.Basic(gs, p, now, 0, 0)
	if p.X != startX || p.Y != startY || p.InvulnerableUntil != 0 || enemy.Lives >= enemy.MaxLives {
		t.Fatalf("position=(%.1f,%.1f) invulnerable=%d damage=%d", p.X, p.Y, p.InvulnerableUntil, enemy.MaxLives-enemy.Lives)
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
	time.Sleep(650 * time.Millisecond)
	gs.updateNewHeroSystems()
	if enemy.StunUntil < now+1900 {
		t.Fatalf("root until=%d want about %d", enemy.StunUntil, now+2000)
	}
}

func TestNewHeroGadgetsRespectSharedCooldownAndEmitCastFeedback(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("kaze", "Kaze", "Kaze")
	p := gs.Players["kaze"]
	now := time.Now().UnixMilli()

	gs.playerAbility("kaze", now, "secondary")
	if p.GadgetCharges != 2 || p.GadgetPulse != 1 || len(gs.Effects) == 0 || gs.Effects[len(gs.Effects)-1].Kind != "kaze_veil_step" {
		t.Fatalf("first gadget charges=%d pulse=%d effects=%#v", p.GadgetCharges, p.GadgetPulse, gs.Effects)
	}
	gs.playerAbility("kaze", now+100, "secondary")
	if p.GadgetCharges != 2 || p.GadgetPulse != 1 {
		t.Fatalf("gadget ignored cooldown, charges=%d pulse=%d want charges=2 pulse=1", p.GadgetCharges, p.GadgetPulse)
	}
}

func TestArmedNewHeroGadgetsHaveDistinctVisibleEffects(t *testing.T) {
	for _, tc := range []struct {
		hero, effect string
	}{
		{"Brock Zeus", "zeus_thunderbrand"},
		{"Wukong Mico", "mico_ruyi_bind"},
	} {
		gs := newTestGameState()
		gs.State = GameStateGame
		gs.PlayerAdd("hero", tc.hero, tc.hero)
		gs.playerAbility("hero", time.Now().UnixMilli(), "secondary")
		if len(gs.Effects) == 0 || gs.Effects[len(gs.Effects)-1].Kind != tc.effect {
			t.Fatalf("%s effect=%#v, want %s", tc.hero, gs.Effects, tc.effect)
		}
	}
}
