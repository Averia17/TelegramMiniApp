package game

import (
	"battle/model/monster"
	"battle/model/prop"
	"math"
	"testing"
	"time"
)

func TestNewHeroCombatKitsAreRegistered(t *testing.T) {
	want := map[string]string{
		"Fairy Mina": "cone", "Brock Zeus": "line", "Kaze": "cone",
		"Wukong Mico": "cone", "Persephone Lumi": "line", "Katty": "line",
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
	gs.PlayerAdd("enemy", "Enemy", "Needle")
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

func TestKattyBasicAttackDamagesEveryTargetInImpactRadius(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("katty", "Katty", "Katty")
	gs.PlayerAdd("target", "Target", "Needle")
	gs.PlayerAdd("bystander", "Bystander", "Mandy")
	katty, target, bystander := gs.Players["katty"], gs.Players["target"], gs.Players["bystander"]
	katty.X, katty.Y = 400, 400
	target.X, target.Y = 500, 400
	bystander.X, bystander.Y = 500, 440
	gs.Monsters["bat"] = monster.NewMonster(500, 450, 16, gs.Map.WidthInPixels, gs.Map.HeightInPixels, monster.MonsterLives)
	crate := prop.NewLunarCrate(500, 460, "damage")
	gs.Props = append(gs.Props, crate)

	KattyKit{}.Basic(gs, katty, time.Now().UnixMilli(), 0, 0)
	shot := gs.Bullets[len(gs.Bullets)-1]
	shot.X, shot.Y = target.X-4, target.Y
	targetBefore, bystanderBefore := target.Lives, bystander.Lives
	monsterBefore, crateBefore := gs.Monsters["bat"].Lives, crate.Lives

	gs.updateBullets()

	if dealt := targetBefore - target.Lives; dealt != katty.AttackDmg {
		t.Fatalf("Katty impact dealt %d to direct target, want %d", dealt, katty.AttackDmg)
	}
	if dealt := bystanderBefore - bystander.Lives; dealt != katty.AttackDmg {
		t.Fatalf("Katty impact dealt %d to nearby hero, want %d", dealt, katty.AttackDmg)
	}
	if dealt := monsterBefore - gs.Monsters["bat"].Lives; dealt != katty.AttackDmg {
		t.Fatalf("Katty impact dealt %d to nearby monster, want %d", dealt, katty.AttackDmg)
	}
	if dealt := crateBefore - crate.Lives; dealt != katty.AttackDmg {
		t.Fatalf("Katty impact dealt %d to nearby crate, want %d", dealt, katty.AttackDmg)
	}
}

func TestKazeEmpowersThirdSuccessfulSlashWithoutDoubleHitting(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("kaze", "Kaze", "Kaze")
	gs.PlayerAdd("enemy", "Enemy", "Needle")
	p, enemy := gs.Players["kaze"], gs.Players["enemy"]
	p.X, p.Y, enemy.X, enemy.Y = 500, 500, 570, 500
	now := time.Now().UnixMilli()

	for hit := 1; hit <= 3; hit++ {
		enemy.Lives = enemy.MaxLives
		KazeKit{}.Basic(gs, p, now+int64(hit)*300, 0, 0)
		got := enemy.MaxLives - enemy.Lives
		want := p.AttackDmg
		if hit == 3 {
			want = int(math.Round(float64(p.AttackDmg) * KazeEmpoweredDamageMultiplier))
		}
		if got != want {
			t.Fatalf("slash %d damage=%d, want %d", hit, got, want)
		}
	}
	if p.KazeCombo != 0 {
		t.Fatalf("combo after empowered third slash=%d, want 0", p.KazeCombo)
	}
}

func TestMicoStaffBuildsRageAndSuperConsumesItForLargerVortex(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("mico", "Mico", "Wukong Mico")
	gs.PlayerAdd("enemy", "Enemy", "Needle")
	p, enemy := gs.Players["mico"], gs.Players["enemy"]
	p.X, p.Y, enemy.X, enemy.Y = 500, 500, 570, 500
	now := time.Now().UnixMilli()

	WukongMicoKit{}.Basic(gs, p, now, 0, 0)
	enemy.Lives = enemy.MaxLives
	WukongMicoKit{}.Basic(gs, p, now+700, 0, 0)
	if p.MicoRage != 2 {
		t.Fatalf("rage after two hits=%d, want 2", p.MicoRage)
	}
	WukongMicoKit{}.Super(gs, p, now, 0, 0)
	if p.MicoRage != 0 {
		t.Fatalf("rage after Super=%d, want 0", p.MicoRage)
	}
	if p.VortexUntil != now+MicoVortexBaseDuration.Milliseconds()+2*MicoVortexDurationPerRage.Milliseconds() {
		t.Fatalf("vortex until=%d, want rage-scaled duration", p.VortexUntil)
	}
	if p.VortexRadius != MicoVortexBaseRadius+2*MicoVortexRadiusPerRage {
		t.Fatalf("vortex radius=%.0f, want rage-scaled radius", p.VortexRadius)
	}
}

func TestMicoFullRageVortexStaysInsideItsCounterplayDamageBudget(t *testing.T) {
	const rage = 5

	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("mico", "Mico", "Wukong Mico")
	gs.PlayerAdd("enemy", "Enemy", "Needle")
	p := gs.Players["mico"]
	p.MicoRage = rage

	WukongMicoKit{}.Super(gs, p, time.Now().UnixMilli(), 0, 0)
	durationMs := (MicoVortexBaseDuration + rage*MicoVortexDurationPerRage).Milliseconds()
	ticks := int(math.Ceil(float64(durationMs) / 250))
	if ticks < 1 {
		ticks = 1
	}
	budget := p.VortexDamage*ticks + micoVortexImpactDamage(rage)
	if budget > 240 {
		t.Fatalf("full-rage vortex damage budget=%d, want <=240 including impact", budget)
	}
	if p.VortexRadius > 200 {
		t.Fatalf("full-rage vortex radius=%.0f, want <=200 for a dodgeable threat", p.VortexRadius)
	}
	if durationMs > 4000 {
		t.Fatalf("full-rage vortex duration=%dms, want <=4000ms for a punish window", durationMs)
	}
}

func TestMicoVengeanceVortexHasAShorterLowerDamageWindow(t *testing.T) {
	const rage = 5

	duration := MicoVortexBaseDuration + rage*MicoVortexDurationPerRage
	if duration > 3*time.Second {
		t.Fatalf("full-rage vortex duration=%s, want <=3s", duration)
	}
	if got := micoVortexImpactDamage(rage); got > 75 {
		t.Fatalf("full-rage vortex impact=%d, want <=75", got)
	}
	if got := micoVortexTickDamage(rage); got > 7 {
		t.Fatalf("full-rage vortex tick=%d, want <=7", got)
	}
	if got := MicoVortexBaseRadius + rage*MicoVortexRadiusPerRage; got > 165 {
		t.Fatalf("full-rage vortex radius=%.0f, want <=165", got)
	}

	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("mico", "Mico", "Wukong Mico")
	p := gs.Players["mico"]
	now := time.Now().UnixMilli()
	p.VortexUntil = now + 1000
	p.VortexTickAt = 0
	gs.updateActiveAbilities()
	if delay := p.VortexTickAt - now; delay < 350 {
		t.Fatalf("vortex tick interval=%dms, want >=350ms to reduce update/effect churn", delay)
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
	for _, hero := range []string{"Needle", "Mandy", "Fairy Mina", "Brock Zeus", "Kaze", "Wukong Mico", "Persephone Lumi", "Katty"} {
		cooldown := AbilityCooldownMs(hero, "primary")
		if cooldown <= 0 || cooldown > MaxHeroSkillDuration.Milliseconds() {
			t.Fatalf("%s primary cooldown=%dms, want 1..%dms", hero, cooldown, MaxHeroSkillDuration.Milliseconds())
		}
	}
}

func TestNeedleSuperTelegraphAndSporeGadgetUseTheNewActiveKit(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("needle", "Needle", "Needle")
	needle := gs.Players["needle"]
	needle.X, needle.Y, needle.Lives, needle.SuperCharge = 400, 400, 400, 100
	now := time.Now().UnixMilli()
	NeedleKit{}.Super(gs, needle, now, 0, 100)
	if len(gs.HeroZones) != 1 || gs.HeroZones[0].TriggerAt != now+300 {
		t.Fatalf("roots=%#v, want 300ms telegraph", gs.HeroZones)
	}
	startX, startY := needle.X, needle.Y
	if !gs.useNewHeroGadget(needle, now+1) || len(gs.HeroZones) != 2 || gs.HeroZones[1].Kind != "needle_spore_cloud" {
		t.Fatalf("needle gadget zones=%#v, want spore cloud", gs.HeroZones)
	}
	if needle.X <= startX || needle.X-startX > NeedleSporeDashDistance+.001 {
		t.Fatalf("spore gadget moved Needle from (%.1f,%.1f) to (%.1f,%.1f)", startX, startY, needle.X, needle.Y)
	}
	if gs.HeroZones[1].Radius != NeedleSporeCloudRadius {
		t.Fatalf("spore cloud radius=%.1f, want %.1f", gs.HeroZones[1].Radius, NeedleSporeCloudRadius)
	}
}

func TestNeedleSuperTargetsAnEnemyInItsAimDirection(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("needle", "Needle", "Needle")
	gs.PlayerAdd("enemy", "Enemy", "Mandy")
	needle, enemy := gs.Players["needle"], gs.Players["enemy"]
	needle.Team, enemy.Team = "green", "blue"
	needle.X, needle.Y = 400, 400
	enemy.X, enemy.Y = 700, 400

	NeedleKit{}.Super(gs, needle, time.Now().UnixMilli(), 0, 100)
	zone := gs.HeroZones[0]
	if math.Abs(zone.X-enemy.X) > .001 || math.Abs(zone.Y-enemy.Y) > .001 {
		t.Fatalf("needle root target=(%.0f,%.0f), want enemy=(%.0f,%.0f)", zone.X, zone.Y, enemy.X, enemy.Y)
	}
}

func TestNeedleReworkSuperTelegraphsThenPullsAndDamagesOnce(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("needle", "Needle", "Needle")
	gs.PlayerAdd("enemy", "Enemy", "Mandy")
	needle, enemy := gs.Players["needle"], gs.Players["enemy"]
	needle.Team, enemy.Team = "green", "blue"
	needle.X, needle.Y, enemy.X, enemy.Y = 400, 400, 500, 400
	now := time.Now().UnixMilli()

	NeedleKit{}.Super(gs, needle, now, 0, 100)
	if len(gs.HeroZones) != 1 || gs.HeroZones[0].TriggerAt != now+300 {
		t.Fatalf("root telegraph=%#v, want trigger at +300ms", gs.HeroZones)
	}
	if enemy.Lives != enemy.MaxLives {
		t.Fatalf("enemy was damaged during telegraph: lives=%d/%d", enemy.Lives, enemy.MaxLives)
	}

	zone := gs.HeroZones[0]
	zone.TriggerAt = time.Now().UnixMilli() - 1
	before := enemy.Lives
	gs.updateNewHeroSystems()
	if enemy.Lives != before-40 {
		t.Fatalf("root impact damage=%d, want 40", before-enemy.Lives)
	}
	if math.Hypot(enemy.X-zone.X, enemy.Y-zone.Y) > 1 {
		t.Fatalf("enemy was not pulled to root center: distance=%.2f", math.Hypot(enemy.X-zone.X, enemy.Y-zone.Y))
	}
	if !zone.ImpactDone {
		t.Fatal("root zone did not mark its initial impact as resolved")
	}
	foundPull := false
	for _, effect := range gs.Effects {
		foundPull = foundPull || effect.Kind == "needle_root_pull"
	}
	if !foundPull {
		t.Fatal("root impact did not emit a readable pull effect")
	}
}

func TestNeedleRootTicksDealFifteenDamageEveryHalfSecond(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("needle", "Needle", "Needle")
	gs.PlayerAdd("enemy", "Enemy", "Mandy")
	needle, enemy := gs.Players["needle"], gs.Players["enemy"]
	needle.Team, enemy.Team = "green", "blue"
	needle.X, needle.Y, enemy.X, enemy.Y = 400, 400, 500, 400
	now := time.Now().UnixMilli()
	NeedleKit{}.Super(gs, needle, now, 0, 100)
	zone := gs.HeroZones[0]
	zone.TriggerAt = now - 1
	gs.updateNewHeroSystems()
	for _, damageZone := range gs.DamageZones {
		if damageZone.Kind == "needle_root" {
			damageZone.NextTickAt = time.Now().UnixMilli() - 1
		}
	}
	before := enemy.Lives
	gs.updateDamageZones()
	if enemy.Lives != before-15 {
		t.Fatalf("root tick damage=%d, want 15", before-enemy.Lives)
	}
}

func TestNeedleSporeHitAppliesTwoSecondAntiHeal(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("needle", "Needle", "Needle")
	gs.PlayerAdd("enemy", "Enemy", "Mandy")
	needle, enemy := gs.Players["needle"], gs.Players["enemy"]
	needle.Team, enemy.Team = "green", "blue"
	needle.X, needle.Y, enemy.X, enemy.Y = 400, 400, 500, 400
	NeedleKit{}.Basic(gs, needle, time.Now().UnixMilli(), 0, 0)
	shot := gs.Bullets[0]
	shot.X, shot.Y = enemy.X-4, enemy.Y
	gs.updateBullets()
	if enemy.AntiHealUntil <= time.Now().UnixMilli() || enemy.AntiHealMultiplier != .50 {
		t.Fatalf("anti-heal until=%d multiplier=%.2f, want active at 50%%", enemy.AntiHealUntil, enemy.AntiHealMultiplier)
	}
}

func TestNeedleSporeEscapeGadgetDashesAndStunsOnThirdStack(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("needle", "Needle", "Needle")
	gs.PlayerAdd("enemy", "Enemy", "Mandy")
	needle, enemy := gs.Players["needle"], gs.Players["enemy"]
	needle.Team, enemy.Team = "green", "blue"
	needle.X, needle.Y, enemy.X, enemy.Y = 400, 400, 440, 400
	now := time.Now().UnixMilli()
	startX := needle.X
	if !gs.useNewHeroGadget(needle, now) {
		t.Fatal("Needle spore escape gadget was rejected")
	}
	if needle.X <= startX || needle.X-startX > NeedleSporeDashDistance+.001 {
		t.Fatalf("Needle dash moved from %.1f to %.1f, want at most 72 units forward", startX, needle.X)
	}
	var cloud *HeroZone
	for _, zone := range gs.HeroZones {
		if zone.Kind == "needle_spore_cloud" {
			cloud = zone
		}
	}
	if cloud == nil || cloud.Radius != 90 {
		t.Fatalf("spore cloud=%#v, want radius 90", cloud)
	}
	for tick := 0; tick < 3; tick++ {
		cloud.NextTickAt = time.Now().UnixMilli() - 1
		gs.updateNewHeroSystems()
	}
	if enemy.StunUntil <= time.Now().UnixMilli() || enemy.SporeStacks != 0 {
		t.Fatalf("third spore stack stun=%d stacks=%d, want active stun and reset stacks", enemy.StunUntil, enemy.SporeStacks)
	}
}

func TestNeedleSporeSplitsIntoSixFixedRadialThorns(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("needle", "Needle", "Needle")
	gs.PlayerAdd("enemy", "Enemy", "Mandy")
	p, enemy := gs.Players["needle"], gs.Players["enemy"]
	p.X, p.Y, enemy.X, enemy.Y = 400, 400, 620, 400

	NeedleKit{}.Basic(gs, p, time.Now().UnixMilli(), 0, 0)
	parent := gs.Bullets[0]
	if parent.Homing || parent.TargetID != "" {
		t.Fatalf("spore homing=%v target=%q, want a manually aimed projectile", parent.Homing, parent.TargetID)
	}
	gs.splitProjectile(parent)
	if len(gs.Bullets) != 7 {
		t.Fatalf("spore split bullets=%d, want parent plus six thorns", len(gs.Bullets))
	}
	for index, thorn := range gs.Bullets[1:] {
		if thorn.Kind != "spike" || thorn.Homing || thorn.TargetID != "" || thorn.Damage <= 1 {
			t.Fatalf("invalid fixed thorn: %#v", thorn)
		}
		wantAngle := float64(index) * math.Pi / 3
		if math.Abs(thorn.Rotation-wantAngle) > .001 {
			t.Fatalf("thorn %d angle=%.3f, want %.3f", index, thorn.Rotation, wantAngle)
		}
	}
}

func TestNeedleDirectHitDoesNotDealHiddenRadialDamage(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("needle", "Needle", "Needle")
	gs.PlayerAdd("target", "Target", "Mandy")
	gs.PlayerAdd("bystander", "Bystander", "Mandy")
	needle, target, bystander := gs.Players["needle"], gs.Players["target"], gs.Players["bystander"]
	needle.X, needle.Y = 400, 400
	target.X, target.Y = 500, 400
	bystander.X, bystander.Y = 500, 450

	NeedleKit{}.Basic(gs, needle, time.Now().UnixMilli(), 0, 0)
	shot := gs.Bullets[0]
	shot.X, shot.Y = target.X-4, target.Y
	before := bystander.Lives
	gs.updateBullets()

	if bystander.Lives != before {
		t.Fatalf("nearby bystander lost %d health to an untelegraphed radial hit", before-bystander.Lives)
	}
}

func TestFairyMinaStarsDoNotSplashOntoNearbyEnemies(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("mina", "Mina", "Fairy Mina")
	gs.PlayerAdd("target", "Target", "Mandy")
	gs.PlayerAdd("bystander", "Bystander", "Mandy")
	mina, target, bystander := gs.Players["mina"], gs.Players["target"], gs.Players["bystander"]
	mina.X, mina.Y = 400, 400
	target.X, target.Y = 500, 400
	bystander.X, bystander.Y = 500, 432

	shot := gs.spawnAttackBullet(mina, 0, "mina_star", mina.AttackDmg, mina.BulletSpd, mina.BulletSz, 510, 0, false, false)
	shot.Splash = heroAttackConfigs[mina.HeroName].SplashRadius
	shot.X, shot.Y = target.X-4, target.Y
	before := bystander.Lives
	gs.updateBullets()

	if bystander.Lives != before {
		t.Fatalf("nearby bystander lost %d health to Mina splash", before-bystander.Lives)
	}
}

func TestNeedleSporeSplitsImmediatelyOnDirectHit(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("needle", "Needle", "Needle")
	gs.PlayerAdd("enemy", "Enemy", "Mandy")
	p, enemy := gs.Players["needle"], gs.Players["enemy"]
	p.X, p.Y, enemy.X, enemy.Y = 400, 400, 500, 400

	NeedleKit{}.Basic(gs, p, time.Now().UnixMilli(), 0, 0)
	gs.Bullets[0].X, gs.Bullets[0].Y = enemy.X-4, enemy.Y
	gs.updateBullets()

	spikes := 0
	for _, shot := range gs.Bullets {
		if shot != nil && shot.Kind == "spike" {
			spikes++
		}
	}
	if spikes != 6 {
		t.Fatalf("direct spore hit spawned %d spikes, want 6", spikes)
	}
}

func TestFairyMinaSuperHealsMinaAndDamagesEnemies(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("mina", "Mina", "Fairy Mina")
	gs.PlayerAdd("ally", "Ally", "Needle")
	gs.PlayerAdd("enemy", "Enemy", "Needle")
	mina, ally, enemy := gs.Players["mina"], gs.Players["ally"], gs.Players["enemy"]
	mina.Team, ally.Team, enemy.Team = "pink", "pink", "blue"
	mina.X, mina.Y, ally.X, ally.Y, enemy.X, enemy.Y = 500, 500, 530, 500, 540, 500
	mina.Lives, ally.Lives, enemy.Lives = 500, ally.MaxLives, 1000
	now := time.Now().UnixMilli()
	MinaKit{}.Super(gs, mina, now, 0, 0)
	gs.updateNewHeroSystems()
	if mina.Lives != 515 || ally.Lives != ally.MaxLives || enemy.Lives != 990 {
		t.Fatalf("aura mina=%d ally=%d enemy=%d, want Mina +15, ally unchanged, enemy -10", mina.Lives, ally.Lives, enemy.Lives)
	}
}

func TestFairyMinaSuperAlwaysTargetsMinaAndAuraFollowsHer(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("mina", "Mina", "Fairy Mina")
	gs.PlayerAdd("ally", "Ally", "Needle")
	mina, ally := gs.Players["mina"], gs.Players["ally"]
	mina.Team, ally.Team = "pink", "pink"
	mina.X, mina.Y, ally.X, ally.Y = 500, 500, 650, 500
	mina.Lives = mina.MaxLives / 2
	ally.Lives = ally.MaxLives / 3
	now := time.Now().UnixMilli()

	MinaKit{}.Super(gs, mina, now, 0, 0)
	if ally.ShieldHP != 0 || mina.ShieldHP != MinaSuperShield {
		t.Fatalf("shield target ally=%d mina=%d, want ally 0 and Mina %d", ally.ShieldHP, mina.ShieldHP, MinaSuperShield)
	}
	mina.X, mina.Y = 900, 500
	livesBefore := mina.Lives
	gs.updateNewHeroSystems()

	if mina.Lives <= livesBefore {
		t.Fatalf("moving aura did not follow and heal Mina: lives=%d, want > %d", mina.Lives, livesBefore)
	}
	zone := gs.HeroZones[0]
	if math.Abs(zone.X-mina.X) > .01 || math.Abs(zone.Y-mina.Y) > .01 {
		t.Fatalf("aura center=(%.1f,%.1f), want Mina=(%.1f,%.1f)", zone.X, zone.Y, mina.X, mina.Y)
	}
}

func TestFairyMinaSuperRejectsDeadOrDistantExplicitAllyTarget(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("mina", "Mina", "Fairy Mina")
	gs.PlayerAdd("ally", "Ally", "Needle")
	mina, ally := gs.Players["mina"], gs.Players["ally"]
	mina.Team, ally.Team = "pink", "pink"
	mina.X, mina.Y, ally.X, ally.Y = 500, 500, 1400, 500
	gs.AbilityTargets[mina.PlayerId] = ally.PlayerId

	MinaKit{}.Super(gs, mina, time.Now().UnixMilli(), 0, 0)
	if len(gs.HeroZones) != 1 || gs.HeroZones[0].Target != mina.PlayerId {
		t.Fatalf("distant explicit ally target = %#v, want Mina fallback", gs.HeroZones)
	}
}

func TestFairyMinaShieldStopsAbsorbingDamageAfterItsDuration(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("mina", "Mina", "Fairy Mina")
	gs.PlayerAdd("attacker", "Attacker", "Mandy")
	mina, attacker := gs.Players["mina"], gs.Players["attacker"]
	mina.Team, attacker.Team = "blue", "red"
	mina.Lives = mina.MaxLives
	now := time.Now().UnixMilli()

	MinaKit{}.Super(gs, mina, now, 0, 0)
	mina.ShieldUntil = now - 1
	before := mina.Lives

	if dealt := gs.dealPlayerDamage(attacker, mina, 100); dealt != 100 {
		t.Fatalf("expired Mina shield reported damage=%d, want 100", dealt)
	}
	if mina.Lives != before-100 || mina.ShieldHP != 0 {
		t.Fatalf("expired Mina shield left lives=%d/%d shield=%d, want lives=%d shield=0", mina.Lives, before, mina.ShieldHP, before-100)
	}
}

func TestFairyMinaStarDetonatesAnExistingLightMark(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("mina", "Mina", "Fairy Mina")
	gs.PlayerAdd("enemy", "Enemy", "Mandy")
	mina, enemy := gs.Players["mina"], gs.Players["enemy"]
	mina.X, mina.Y, enemy.X, enemy.Y = 400, 400, 500, 400
	gs.LightMarkedUntil[enemy.PlayerId] = time.Now().Add(time.Second).UnixMilli()
	enemy.Marks = 2
	shot := gs.spawnAttackBullet(mina, 0, "mina_star", mina.AttackDmg, mina.BulletSpd, mina.BulletSz, 510, 0, false, false)
	shot.X, shot.Y = enemy.X-4, enemy.Y
	before := enemy.Lives

	gs.updateBullets()

	if dealt := before - enemy.Lives; dealt <= mina.AttackDmg {
		t.Fatalf("marked star damage=%d, want more than base %d", dealt, mina.AttackDmg)
	}
	if gs.LightMarkedUntil[enemy.PlayerId] != 0 {
		t.Fatalf("light mark remains until %d, want consumed", gs.LightMarkedUntil[enemy.PlayerId])
	}
	foundBurst := false
	for _, effect := range gs.Effects {
		foundBurst = foundBurst || effect.Kind == "mina_mark_burst"
	}
	if !foundBurst {
		t.Fatal("marked star did not emit mina_mark_burst feedback")
	}
}

func TestFairyMinaGadgetConsumesMarkedEnemyAndShowsBreak(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("mina", "Mina", "Fairy Mina")
	gs.PlayerAdd("enemy", "Enemy", "Mandy")
	mina, enemy := gs.Players["mina"], gs.Players["enemy"]
	mina.X, mina.Y, enemy.X, enemy.Y = 400, 400, 500, 400
	now := time.Now().UnixMilli()
	gs.LightMarkedUntil[enemy.PlayerId] = now + 2000
	enemy.Marks = 1

	if !gs.useNewHeroGadget(mina, now) {
		t.Fatal("Mina gadget was rejected")
	}
	if gs.LightMarkedUntil[enemy.PlayerId] != 0 || enemy.Marks != 0 {
		t.Fatalf("mark after repelling wave until=%d stacks=%d, want consumed", gs.LightMarkedUntil[enemy.PlayerId], enemy.Marks)
	}
	foundBreak := false
	for _, effect := range gs.Effects {
		foundBreak = foundBreak || effect.Kind == "mina_mark_break"
	}
	if !foundBreak {
		t.Fatal("consumed Mina mark did not emit break feedback")
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
	if len(gs.LightningStrikes) != 3 || p.ChannelUntil != now+700 {
		t.Fatalf("strikes=%d channel=%d", len(gs.LightningStrikes), p.ChannelUntil)
	}
	warnings := 0
	for _, effect := range gs.Effects {
		if effect.Kind == "zeus_strike_warning" {
			warnings++
		}
	}
	if warnings != 3 {
		t.Fatalf("strike warnings=%d, want 3", warnings)
	}
}

func TestBrockSuperEndsWithOneLargerImpactWithoutHiddenFireZone(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("brock", "Brock", "Brock Zeus")
	p := gs.Players["brock"]
	now := time.Now().UnixMilli()
	BrockZeusKit{}.Super(gs, p, now, 0, 300)
	for _, strike := range gs.LightningStrikes {
		strike.TriggerAt = now - 1
	}

	gs.updateNewHeroSystems()

	if len(gs.DamageZones) != 0 {
		t.Fatalf("Brock Super left %d hidden damage zones", len(gs.DamageZones))
	}
	largeImpact := false
	for _, effect := range gs.Effects {
		if effect.Kind == "zeus_lightning_strike" && effect.Radius == ZeusSuperFinalRadius && effect.Damage == ZeusSuperFinalDamage {
			largeImpact = true
		}
	}
	if !largeImpact {
		t.Fatal("third strike did not produce a readable larger impact")
	}
}

func TestBrockBasicProjectileExplodesWithoutDestroyingCover(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("brock", "Brock", "Brock Zeus")
	p := gs.Players["brock"]
	p.X, p.Y = 400, 400

	BrockZeusKit{}.Basic(gs, p, time.Now().UnixMilli(), 0, 0)
	if len(gs.Bullets) != 1 || gs.Bullets[0].DestroyWalls || gs.Bullets[0].Splash != ZeusBasicSplashRadius {
		t.Fatalf("Brock projectile=%#v, want one splash projectile without wall breaking", gs.Bullets)
	}
}

func TestBrockArmedBeamDamagesVisibleMonster(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("brock", "Brock", "Brock Zeus")
	p := gs.Players["brock"]
	p.X, p.Y, p.GadgetArmed = 100, 100, true
	gs.Monsters["bat"] = monster.NewMonster(180, 100, 16, 480, 480, monster.MonsterLives)
	before := gs.Monsters["bat"].Lives

	BrockZeusKit{}.Basic(gs, p, time.Now().UnixMilli(), 0, 0)

	if gs.Monsters["bat"].Lives >= before {
		t.Fatalf("armed beam did not damage monster: lives=%d before=%d", gs.Monsters["bat"].Lives, before)
	}
}

func TestKazeSuperCrossesAndStunsEnemy(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("kaze", "Kaze", "Kaze")
	gs.PlayerAdd("enemy", "Enemy", "Needle")
	p, enemy := gs.Players["kaze"], gs.Players["enemy"]
	p.X, p.Y, enemy.X, enemy.Y = 500, 500, 650, 500
	now := time.Now().UnixMilli()
	KazeKit{}.Super(gs, p, now, 0, 0)
	if enemy.Lives != enemy.MaxLives-160 || enemy.StunUntil != now+MeleeSkillStunDuration.Milliseconds() {
		t.Fatalf("enemy lives=%d stun=%d", enemy.Lives, enemy.StunUntil)
	}
	if p.KazeCombo != 2 {
		t.Fatalf("combo after crossing enemy=%d, want empowered follow-up at 2", p.KazeCombo)
	}
	ready := false
	for _, effect := range gs.Effects {
		ready = ready || effect.Kind == "kaze_followup_ready"
	}
	if !ready {
		t.Fatal("dash hit did not show the empowered follow-up")
	}
}

func TestKazeSuperPrimesHerFollowUpWithoutGlobalDamageVulnerability(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("kaze", "Kaze", "Kaze")
	gs.PlayerAdd("enemy", "Enemy", "Mandy")
	gs.PlayerAdd("ally", "Ally", "Needle")
	kaze, enemy, ally := gs.Players["kaze"], gs.Players["enemy"], gs.Players["ally"]
	kaze.X, kaze.Y, enemy.X, enemy.Y = 400, 400, 520, 400
	now := time.Now().UnixMilli()

	KazeKit{}.Super(gs, kaze, now, 0, 0)

	if kaze.KazeCombo != 2 {
		t.Fatalf("Kaze combo=%d, want an empowered personal follow-up", kaze.KazeCombo)
	}
	before := enemy.Lives
	gs.dealPlayerDamage(ally, enemy, ally.AttackDmg)
	if dealt := before - enemy.Lives; dealt != ally.AttackDmg {
		t.Fatalf("another hero dealt %d through Kaze Super, want base %d", dealt, ally.AttackDmg)
	}
}

func TestMicoStoneArmorCapsStoredDamageAndConvertsItIntoRage(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("mico", "Mico", "Wukong Mico")
	gs.PlayerAdd("enemy", "Enemy", "Mandy")
	mico, enemy := gs.Players["mico"], gs.Players["enemy"]
	now := time.Now().UnixMilli()
	if !gs.useNewHeroGadget(mico, now) {
		t.Fatal("stone armor was rejected")
	}
	gs.dealPlayerDamage(enemy, mico, 1000)
	if mico.SuppressedRage > 240 {
		t.Fatalf("stored damage=%d, want safety cap 240", mico.SuppressedRage)
	}
	mico.StoneArmorUntil = time.Now().UnixMilli() - 1
	gs.updateNewHeroSystems()
	if mico.MicoRage == 0 {
		t.Fatal("stone armor explosion did not convert absorbed damage into rage")
	}
}

func TestMicoStoneArmorExplodesAroundHimOnExpiry(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("mico", "Mico", "Wukong Mico")
	gs.PlayerAdd("enemy", "Enemy", "Mandy")
	mico, enemy := gs.Players["mico"], gs.Players["enemy"]
	mico.X, mico.Y, enemy.X, enemy.Y = 500, 500, 560, 500
	now := time.Now().UnixMilli()
	if !gs.useNewHeroGadget(mico, now) {
		t.Fatal("stone armor was rejected")
	}
	gs.dealPlayerDamage(enemy, mico, 120)
	before := enemy.Lives
	mico.StoneArmorUntil = time.Now().UnixMilli() - 1

	gs.updateNewHeroSystems()

	if enemy.Lives != before-80 {
		t.Fatalf("Stone Armor explosion damage=%d, want 80", before-enemy.Lives)
	}
	if mico.MicoRage == 0 {
		t.Fatal("Stone Armor did not convert absorbed damage into Rage")
	}
}

func TestMicoStaffAttackDamagesInFrontWithoutMovingOrGrantingInvulnerability(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("mico", "Mico", "Wukong Mico")
	gs.PlayerAdd("enemy", "Enemy", "Needle")
	p, enemy := gs.Players["mico"], gs.Players["enemy"]
	p.X, p.Y, enemy.X, enemy.Y = 500, 500, 600, 500
	startX, startY := p.X, p.Y
	now := time.Now().UnixMilli()
	WukongMicoKit{}.Basic(gs, p, now, 0, 0)
	if p.X != startX || p.Y != startY || p.InvulnerableUntil != 0 || enemy.Lives >= enemy.MaxLives {
		t.Fatalf("position=(%.1f,%.1f) invulnerable=%d damage=%d", p.X, p.Y, p.InvulnerableUntil, enemy.MaxLives-enemy.Lives)
	}
}

func TestLumiRootDealsInitialDamageAndStunsForOneSecond(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("lumi", "Lumi", "Persephone Lumi")
	gs.PlayerAdd("enemy", "Enemy", "Needle")
	p, enemy := gs.Players["lumi"], gs.Players["enemy"]
	p.X, p.Y, enemy.X, enemy.Y = 400, 400, 500, 400
	now := time.Now().UnixMilli()
	PersephoneLumiKit{}.Super(gs, p, now, 0, 100)
	time.Sleep(650 * time.Millisecond)
	gs.updateNewHeroSystems()
	if enemy.StunUntil < now+900 {
		t.Fatalf("root until=%d want about %d", enemy.StunUntil, now+1000)
	}
	if dealt := enemy.MaxLives - enemy.Lives; dealt != 60 {
		t.Fatalf("root impact damage=%d want 60", dealt)
	}
	if enemy.SlowUntil <= time.Now().UnixMilli() {
		t.Fatalf("root zone did not keep slowing the enemy while it remained inside")
	}
}

func TestLumiGadgetDetonatesEveryOwnedGardenAtItsPosition(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("lumi", "Lumi", "Persephone Lumi")
	gs.PlayerAdd("first", "First", "Needle")
	gs.PlayerAdd("second", "Second", "Needle")
	lumi, first, second := gs.Players["lumi"], gs.Players["first"], gs.Players["second"]
	lumi.Team, first.Team, second.Team = "pink", "blue", "blue"
	first.X, first.Y, second.X, second.Y = 300, 300, 700, 300
	now := time.Now().UnixMilli()
	gs.HeroZones = append(gs.HeroZones,
		&HeroZone{Owner: lumi.PlayerId, Kind: "lumi_roots", X: 300, Y: 300, Radius: 100, ExpiresAt: now + 5000},
		&HeroZone{Owner: lumi.PlayerId, Kind: "lumi_flower", X: 700, Y: 300, Radius: 100, ExpiresAt: now + 5000},
	)
	firstBefore, secondBefore := first.Lives, second.Lives
	lumi.Lives = lumi.MaxLives - 20

	if !gs.useNewHeroGadget(lumi, now) {
		t.Fatal("Lumi gadget was rejected with two active gardens")
	}
	if first.Lives >= firstBefore || second.Lives >= secondBefore {
		t.Fatalf("garden damage first=%d/%d second=%d/%d", first.Lives, firstBefore, second.Lives, secondBefore)
	}
	if lumi.Lives != lumi.MaxLives {
		t.Fatalf("Lumi gadget heal=%d want 20", lumi.Lives-(lumi.MaxLives-20))
	}
	if len(gs.HeroZones) != 0 {
		t.Fatalf("Lumi gadget left %d owned zones, want 0", len(gs.HeroZones))
	}
	positions := map[[2]float64]bool{}
	for _, effect := range gs.Effects {
		if effect.Kind == "lumi_seedburst" {
			positions[[2]float64{effect.X, effect.Y}] = true
		}
	}
	if !positions[[2]float64{300, 300}] || !positions[[2]float64{700, 300}] {
		t.Fatalf("detonation effects=%v, want both garden positions", positions)
	}
}

func TestLumiGadgetDamagesAnEnemyOnlyOnceAcrossOverlappingGardens(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("lumi", "Lumi", "Persephone Lumi")
	gs.PlayerAdd("enemy", "Enemy", "Needle")
	lumi, enemy := gs.Players["lumi"], gs.Players["enemy"]
	lumi.Team, enemy.Team = "pink", "blue"
	enemy.X, enemy.Y = 500, 500
	now := time.Now().UnixMilli()
	gs.HeroZones = append(gs.HeroZones,
		&HeroZone{Owner: lumi.PlayerId, Kind: "lumi_flower", X: 500, Y: 500, Radius: 100, ExpiresAt: now + 5000},
		&HeroZone{Owner: lumi.PlayerId, Kind: "lumi_roots", X: 520, Y: 500, Radius: 100, ExpiresAt: now + 5000},
	)
	before := enemy.Lives

	if !gs.useNewHeroGadget(lumi, now) {
		t.Fatal("Lumi gadget was rejected")
	}
	if dealt := before - enemy.Lives; dealt != 55 {
		t.Fatalf("overlapping garden damage=%d, want one capped burst of 55", dealt)
	}
}

func TestLumiFlowerRevealsEnemiesWhileSlowingThem(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("lumi", "Lumi", "Persephone Lumi")
	gs.PlayerAdd("enemy", "Enemy", "Needle")
	lumi, enemy := gs.Players["lumi"], gs.Players["enemy"]
	lumi.Team, enemy.Team = "pink", "blue"
	now := time.Now().UnixMilli()
	gs.HeroZones = append(gs.HeroZones, &HeroZone{Owner: lumi.PlayerId, Kind: "lumi_flower", X: enemy.X, Y: enemy.Y, Radius: 70, ExpiresAt: now + 5000})

	gs.updateNewHeroSystems()

	if enemy.RevealedUntil <= now || enemy.SlowUntil <= now {
		t.Fatalf("flower reveal=%d slow=%d, want both active after entering", enemy.RevealedUntil, enemy.SlowUntil)
	}
}

func TestLumiBasicSpawnsProjectileAndGrowsDamagingFlower(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("lumi", "Lumi", "Persephone Lumi")
	gs.PlayerAdd("enemy", "Enemy", "Needle")
	lumi, enemy := gs.Players["lumi"], gs.Players["enemy"]
	lumi.X, lumi.Y, enemy.X, enemy.Y = 400, 400, 520, 400
	before := enemy.Lives
	now := time.Now().UnixMilli()

	PersephoneLumiKit{}.Basic(gs, lumi, now, 0, 0)

	if len(gs.Bullets) != 1 || gs.Bullets[0].Kind != "lumi_orb" {
		t.Fatalf("Lumi basic bullets=%#v, want one lumi_orb", gs.Bullets)
	}
	gs.Bullets[0].X, gs.Bullets[0].Y = enemy.X, enemy.Y
	gs.updateBullets()
	if enemy.Lives >= before || len(gs.HeroZones) != 1 || gs.HeroZones[0].Kind != "lumi_flower" {
		t.Fatalf("Lumi projectile impact lives=%d/%d zones=%#v", enemy.Lives, before, gs.HeroZones)
	}
	if len(gs.DamageZones) != 1 || gs.DamageZones[0].Damage != 15 || gs.DamageZones[0].Interval != 500 {
		t.Fatalf("Lumi flower damage zones=%#v, want 15 damage every 500ms", gs.DamageZones)
	}
}

func TestLumiFlowerTicksDealFifteenDamageEveryHalfSecond(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("lumi", "Lumi", "Persephone Lumi")
	gs.PlayerAdd("enemy", "Enemy", "Needle")
	lumi, enemy := gs.Players["lumi"], gs.Players["enemy"]
	lumi.Team, enemy.Team = "pink", "blue"
	enemy.X, enemy.Y = lumi.X, lumi.Y
	now := time.Now().UnixMilli()
	gs.DamageZones = append(gs.DamageZones, &DamageZone{
		Owner: lumi.PlayerId, Kind: "lumi_flower", X: enemy.X, Y: enemy.Y, Radius: LumiFlowerRadius,
		Damage: LumiFlowerDamage, TicksLeft: 12, NextTickAt: now - 1, Interval: LumiFlowerTick.Milliseconds(), ExpiresAt: now + 6000,
	})
	before := enemy.Lives
	gs.updateDamageZones()
	if dealt := before - enemy.Lives; dealt != LumiFlowerDamage {
		t.Fatalf("flower tick damage=%d, want %d", dealt, LumiFlowerDamage)
	}
}

func TestNeedleRootZoneKeepsSlowingEnemiesAfterInitialRoot(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("needle", "Needle", "Needle")
	gs.PlayerAdd("enemy", "Enemy", "Mandy")
	needle, enemy := gs.Players["needle"], gs.Players["enemy"]
	needle.Team, enemy.Team = "green", "blue"
	enemy.X, enemy.Y = 500, 400
	now := time.Now().UnixMilli()
	gs.HeroZones = append(gs.HeroZones, &HeroZone{Owner: needle.PlayerId, Kind: "needle_roots", X: 500, Y: 400, Radius: 120, TriggerAt: now - 1, ExpiresAt: now + 4000, Triggered: map[string]bool{}})

	gs.updateNewHeroSystems()

	if enemy.SlowUntil <= now || enemy.SlowMultiplier >= .70 {
		t.Fatalf("root slow until=%d multiplier=%.2f, want refreshed persistent slow", enemy.SlowUntil, enemy.SlowMultiplier)
	}
	foundBurst := false
	for _, effect := range gs.Effects {
		foundBurst = foundBurst || effect.Kind == "needle_root_pull" || effect.Kind == "needle_root_active"
	}
	if !foundBurst {
		t.Fatal("root zone did not emit a readable control burst")
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
