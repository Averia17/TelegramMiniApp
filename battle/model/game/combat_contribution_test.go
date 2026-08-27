package game

import (
	"battle/model/monster"
	"battle/model/prop"
	"testing"
)

func TestCombatContributionSeparatesBasicAndSkillDamage(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("attacker", "Attacker", "Kaze")
	gs.PlayerAdd("target", "Target", "Mandy")
	gs.State = GameStateGame
	attacker := gs.Players["attacker"]
	target := gs.Players["target"]
	attacker.X, attacker.Y, attacker.Rotation = 100, 100, 0
	target.X, target.Y = 145, 100

	gs.playerShootWithCommand("attacker", 1_000, 0, "basic-1")
	if attacker.BasicDamage <= 0 || attacker.SkillDamage != 0 {
		t.Fatalf("basic contribution = basic=%d skill=%d", attacker.BasicDamage, attacker.SkillDamage)
	}

	target.Lives = target.MaxLives
	attacker.SuperCharge = 100
	gs.playerAbility("attacker", 20_000, "primary", "super-1")
	if attacker.SkillDamage <= 0 {
		t.Fatalf("skill contribution = %d, want immediate Kaze Super damage", attacker.SkillDamage)
	}
}

func TestCombatContributionClassifiesKillsByActionType(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("attacker", "Attacker", "Kaze")
	gs.PlayerAdd("target", "Target", "Mandy")
	gs.State = GameStateGame
	attacker := gs.Players["attacker"]
	target := gs.Players["target"]
	attacker.X, attacker.Y, attacker.Rotation = 100, 100, 0
	target.X, target.Y = 145, 100
	target.Lives = 1

	gs.playerShootWithCommand("attacker", 1_000, 0, "basic-kill")
	if attacker.BasicOnlyKills != 1 || attacker.SkillAssistedKills != 0 {
		t.Fatalf("basic kill contribution = basic=%d skill=%d", attacker.BasicOnlyKills, attacker.SkillAssistedKills)
	}
}

func TestCombatContributionClassifiesSkillAssistedKills(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("attacker", "Attacker", "Kaze")
	gs.PlayerAdd("target", "Target", "Mandy")
	gs.State = GameStateGame
	attacker := gs.Players["attacker"]
	target := gs.Players["target"]
	attacker.X, attacker.Y, attacker.Rotation = 100, 100, 0
	target.X, target.Y = 145, 100
	target.Lives = 1
	attacker.SuperCharge = 100

	gs.playerAbility("attacker", 1_000, "primary", "skill-kill")

	if attacker.SkillAssistedKills != 1 || attacker.BasicOnlyKills != 0 {
		t.Fatalf("skill kill contribution = basic=%d skill=%d, want 0/1", attacker.BasicOnlyKills, attacker.SkillAssistedKills)
	}
}

func TestCombatContributionRecordsRoleAndPacingMetrics(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	now := int64(1_000)
	gs.clockNow = func() int64 { return now }
	gs.MatchStartedAt = 500
	gs.PlayerAdd("source", "Source", "Fairy Mina")
	gs.PlayerAdd("ally", "Ally", "Needle")
	gs.PlayerAdd("enemy", "Enemy", "Mandy")
	source, ally, enemy := gs.Players["source"], gs.Players["ally"], gs.Players["enemy"]
	source.Team, ally.Team, enemy.Team = "Red", "Red", "Blue"

	addSuperChargeForControl(source, enemy, 800)
	addSuperChargeForSupport(source, 40, source.MaxLives)
	if source.ControlAppliedMs != 800 || source.HealingDone != 40 {
		t.Fatalf("role metrics = control=%d healing=%d, want 800/40", source.ControlAppliedMs, source.HealingDone)
	}
	source.Lives = source.MaxLives - 100
	source.AntiHealUntil, source.AntiHealMultiplier = now+2_000, .5
	if healed := gs.healPlayerAt(source, 40, now); healed != 20 || source.HealingBlocked != 20 {
		t.Fatalf("anti-heal metrics = healed=%d blocked=%d, want 20/20", healed, source.HealingBlocked)
	}
	now += 500
	if healed := gs.healPlayerAt(source, 20, now); healed != 10 || source.HealWindowMs != 500 {
		t.Fatalf("heal window metrics = healed=%d window=%d, want 10/500", healed, source.HealWindowMs)
	}
	now = 1_000
	if !(MinaKit{}).Super(gs, source, now, 0, 0) || source.ShieldProvided != MinaSuperShield {
		t.Fatalf("shield metric = %d, want %d", source.ShieldProvided, MinaSuperShield)
	}

	enemy.ShieldHP = 50
	enemy.Lives = 50
	if dealt := gs.applyDamageAmount(enemy, 50); dealt != 50 {
		t.Fatalf("shielded damage = %d, want 50 including shield absorption", dealt)
	}
	if enemy.DamagePrevented != 50 || enemy.EscapeSaves != 1 || !enemy.IsAlive() {
		t.Fatalf("defense metrics = prevented=%d saves=%d alive=%v, want 50/1/true", enemy.DamagePrevented, enemy.EscapeSaves, enemy.IsAlive())
	}

	if gs.dealPlayerDamage(source, enemy, 10) != 10 {
		t.Fatalf("source metric contact did not land")
	}
	now = 1_500
	if gs.dealPlayerDamage(ally, enemy, 10) != 10 {
		t.Fatalf("ally metric contact did not land")
	}
	if source.TimeToFirstContactMs != 500 || source.CombatUptimeMs != 0 {
		t.Fatalf("source pacing = first=%d uptime=%d, want 500/0", source.TimeToFirstContactMs, source.CombatUptimeMs)
	}

	bat := monster.NewMonsterAt(now, 200, 200, 16, 800, 800, 100)
	gs.Monsters["bat"] = bat
	if gs.damageMonster("bat", bat, 10, source.PlayerId) || !bat.IsAlive() {
		t.Fatalf("bat should remain alive after nonlethal damage")
	}
	_ = ally

	reward := prop.NewProp("health_boost", source.X, source.Y, 14)
	reward.HealthBoostKillerID = source.PlayerId
	if !gs.collectHealthBoost(source, reward) || source.CubeClaims != 1 {
		t.Fatalf("cube metric = claims=%d, want 1", source.CubeClaims)
	}
}

func TestCombatContributionRecordsAssistAndCombatUptime(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	now := int64(1_000)
	gs.clockNow = func() int64 { return now }
	gs.MatchStartedAt = now
	gs.PlayerAdd("assister", "Assister", "Needle")
	gs.PlayerAdd("killer", "Killer", "Mandy")
	gs.PlayerAdd("target", "Target", "Kaze")
	assister, killer, target := gs.Players["assister"], gs.Players["killer"], gs.Players["target"]
	assister.Team, killer.Team, target.Team = "Red", "Red", "Blue"
	target.Lives = target.MaxLives
	if gs.dealPlayerDamage(assister, target, 10) != 10 {
		t.Fatalf("assist setup damage did not land")
	}
	now = 1_500
	if gs.dealPlayerDamage(assister, target, 10) != 10 {
		t.Fatalf("second contact did not land")
	}
	if assister.CombatUptimeMs != 500 {
		t.Fatalf("combat uptime = %d, want 500", assister.CombatUptimeMs)
	}
	now = 4_000
	gs.playerMove(assister.PlayerId, now, 1, 0)
	now = 4_500
	gs.playerMove(assister.PlayerId, now, 1, 0)
	if assister.UncontestedTravelMs != 500 {
		t.Fatalf("uncontested travel = %d, want 500", assister.UncontestedTravelMs)
	}
	target.Lives = 1
	now = 1_700
	if gs.dealPlayerDamage(killer, target, 10) <= 0 || assister.Assists != 1 {
		t.Fatalf("assist metric = %d, want 1", assister.Assists)
	}
}
