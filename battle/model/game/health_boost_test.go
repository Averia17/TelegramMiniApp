package game

import (
	"battle/model/monster"
	"battle/model/prop"
	"battle/service/geometry"
	"testing"
	"time"
)

func TestCollectingHealthBoostAddsFivePercentOfOriginalHealth(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("collector", "Collector", "Mandy")
	gs.State = GameStateGame
	collector := gs.Players["collector"]
	collector.Lives = collector.MaxLives / 2
	reward := prop.NewProp("health_boost", collector.X, collector.Y, 12)
	gs.Props = append(gs.Props, reward)

	baseMaxLives := collector.MaxLives
	baseLives := collector.Lives
	gs.collectPickups(collector)

	wantBonus := int(float64(baseMaxLives)*.05 + .5)
	if collector.MaxLives != baseMaxLives+wantBonus || collector.Lives != baseLives {
		t.Fatalf("collector lives=%d/%d, want %d/%d", collector.Lives, collector.MaxLives, baseLives, baseMaxLives+wantBonus)
	}
	if reward.Active {
		t.Fatal("health boost remained active after collection")
	}
}

func TestCappedTeamHealthBoostRemainsAvailable(t *testing.T) {
	gs := newTestGameState()
	gs.Mode = ModeTeamDeathmatch
	gs.State = GameStateGame
	gs.PlayerAdd("killer", "Killer", "Needle")
	gs.PlayerAdd("ally", "Ally", "Mina")
	killer := gs.Players["killer"]
	ally := gs.Players["ally"]
	killer.Team, ally.Team = "red", "red"
	killer.HealthBoosts, ally.HealthBoosts = 5, 5
	reward := prop.NewProp("health_boost", killer.X, killer.Y, 12)
	reward.HealthBoostKillerID = killer.PlayerId
	reward.VisibilityTeam = "red"
	gs.Props = append(gs.Props, reward)

	gs.collectPickups(killer)

	if !reward.Active {
		t.Fatal("capped team health boost was consumed without benefiting a teammate")
	}
	if killer.HealthBoosts != 5 || ally.HealthBoosts != 5 {
		t.Fatalf("capped team health boost changed stacks: killer=%d ally=%d", killer.HealthBoosts, ally.HealthBoosts)
	}
}

func TestTeamHealthBoostIsConsumedWhenAnyTeammateCanBenefit(t *testing.T) {
	gs := newTestGameState()
	gs.Mode = ModeTeamDeathmatch
	gs.State = GameStateGame
	gs.PlayerAdd("killer", "Killer", "Needle")
	gs.PlayerAdd("ally", "Ally", "Mina")
	killer := gs.Players["killer"]
	ally := gs.Players["ally"]
	killer.Team, ally.Team = "red", "red"
	killer.HealthBoosts, ally.HealthBoosts = 5, 4
	reward := prop.NewProp("health_boost", killer.X, killer.Y, 12)
	reward.HealthBoostKillerID = killer.PlayerId
	reward.VisibilityTeam = "red"
	gs.Props = append(gs.Props, reward)

	gs.collectPickups(killer)

	if reward.Active {
		t.Fatal("team health boost stayed active despite benefiting a teammate")
	}
	if ally.HealthBoosts != 5 || killer.HealthBoosts != 5 {
		t.Fatalf("team health boost stacks = killer=%d ally=%d, want 5/5", killer.HealthBoosts, ally.HealthBoosts)
	}
}

func TestMonsterDeathAlwaysAppendsOneHealthBoostDrop(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("attacker", "Attacker", "Needle")
	gs.State = GameStateGame
	gs.Players["attacker"].X, gs.Players["attacker"].Y = 100, 100
	target := monster.NewMonster(140, 100, 16, 512, 512, 1)
	target.Tier = 1
	gs.Monsters["bat"] = target

	if !gs.damageMonster("bat", target, 10) {
		t.Fatal("monster was not killed")
	}

	var reward *prop.Prop
	for _, candidate := range gs.Props {
		if candidate.Type == "health_boost" {
			reward = candidate
			break
		}
	}
	if reward == nil {
		t.Fatal("monster kill did not append a health boost")
	}
}

func TestBatRewardKeepsTheLethalClaimantAndTeamVisibility(t *testing.T) {
	gs := newTestGameState()
	gs.Mode = ModeTeamDeathmatch
	gs.State = GameStateGame
	gs.PlayerAdd("killer", "Killer", "Kaze")
	killer := gs.Players["killer"]
	killer.Team = "Blue"
	target := monster.NewMonster(140, 100, 16, 512, 512, 1)
	gs.Monsters["bat"] = target

	if !gs.damageMonster("bat", target, 1, killer.PlayerId) {
		t.Fatal("monster was not killed")
	}
	if len(gs.Props) != 1 {
		t.Fatalf("monster reward count=%d, want one", len(gs.Props))
	}
	reward := gs.Props[0]
	if reward.HealthBoostKillerID != killer.PlayerId || reward.VisibilityTeam != killer.Team || reward.VisibilityPlayerID != "" {
		t.Fatalf("bat reward claimant=%q team=%q player=%q, want killer/team ownership", reward.HealthBoostKillerID, reward.VisibilityTeam, reward.VisibilityPlayerID)
	}
}

func TestBatRewardTelemetryDistinguishesDeniedEnemyAndTeamClaim(t *testing.T) {
	gs := newTestGameState()
	gs.Mode = ModeTeamDeathmatch
	gs.State = GameStateGame
	gs.PlayerAdd("killer", "Killer", "Kaze")
	gs.PlayerAdd("ally", "Ally", "Needle")
	gs.PlayerAdd("enemy", "Enemy", "Mandy")
	killer, ally, enemy := gs.Players["killer"], gs.Players["ally"], gs.Players["enemy"]
	killer.Team, ally.Team, enemy.Team = "Blue", "Blue", "Red"
	killer.X, killer.Y = 100, 100
	ally.X, ally.Y = 120, 100
	enemy.X, enemy.Y = 100, 100
	reward := prop.NewProp("health_boost", killer.X, killer.Y, 12)
	reward.LootType = "bat"
	reward.LootSourceID = "bat-camp"
	reward.HealthBoostKillerID = killer.PlayerId
	reward.VisibilityTeam = killer.Team
	gs.Props = append(gs.Props, reward)

	gs.collectPickups(enemy)
	if !reward.Active {
		t.Fatal("enemy attempt consumed a team-owned bat reward")
	}
	gs.collectPickups(killer)

	metrics := gs.BatLifecycleMetricsSnapshot()
	if metrics.RewardClaims != 1 || metrics.RewardDenials != 1 || metrics.RewardClaimsByRole["Assassin"] != 1 {
		t.Fatalf("bat reward claim metrics = %#v, want one denied enemy and one attributed team claim", metrics)
	}
	events := gs.BatLifecycleTimelineSnapshot()
	if len(events) != 2 || events[0].Kind != "denial" || events[0].BatID != "bat-camp" || events[0].ClaimantID != enemy.PlayerId || events[1].Kind != "claim" || events[1].BatID != "bat-camp" || events[1].ClaimantID != killer.PlayerId || events[1].KillerID != killer.PlayerId {
		t.Fatalf("bat reward claimant timeline = %#v, want denied enemy then successful killer claim", events)
	}
}

func TestMonsterDeathSchedulesOneRewardPerDeterministicCampCycle(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.MonsterRespawns = make(map[string]MonsterRespawn)
	target := monster.NewMonster(140, 100, 16, 512, 512, 1)
	gs.Monsters["bat"] = target

	if !gs.damageMonster("bat", target, 1) {
		t.Fatal("monster was not defeated")
	}
	if len(gs.Props) != 1 || gs.Props[0].Type != "health_boost" {
		t.Fatalf("first camp cycle drops = %#v, want one health boost", gs.Props)
	}
	respawn, ok := gs.MonsterRespawns["bat"]
	if !ok {
		t.Fatal("monster death did not schedule a respawn")
	}
	respawn.RespawnAt = time.Now().Add(-time.Millisecond).UnixMilli()
	gs.MonsterRespawns["bat"] = respawn
	gs.updateMonsters()
	if gs.Monsters["bat"] == nil || !gs.Monsters["bat"].IsAlive() {
		t.Fatal("deterministic camp respawn did not restore the bat")
	}

	respawned := gs.Monsters["bat"]
	if !gs.damageMonster("bat", respawned, 1) {
		t.Fatal("respawned monster was not defeated")
	}
	if len(gs.Props) != 2 {
		t.Fatalf("second camp cycle drops = %#v, want one additional health boost", gs.Props)
	}
}

func TestHealthBoostDropExpiresAfterItsContestWindow(t *testing.T) {
	gs := newTestGameState()
	reward := prop.NewProp("health_boost", 120, 120, 14)
	reward.ExpiresAt = time.Now().Add(-time.Millisecond).UnixMilli()
	gs.Props = append(gs.Props, reward)

	gs.expireProps(time.Now().UnixMilli())

	if reward.Active {
		t.Fatal("expired health boost remained active")
	}
}

func TestHealthBoostDropMovesOutOfBlockingWall(t *testing.T) {
	gs := newTestGameState()
	wall := &geometry.WallTile{MinX: 90, MinY: 90, MaxX: 130, MaxY: 130, Type: "wall"}
	gs.Map.Collisions = []*geometry.WallTile{wall}
	gs.Walls = geometry.NewSpatialHash(TileSize)
	gs.Walls.Insert(wall)
	gs.PlayerAdd("killer", "Killer", "Needle")
	target := gs.Players["killer"]
	target.X, target.Y = 110, 110
	gs.dropHeroHealthBoost(target, target)

	if len(gs.Props) != 1 || geometry.CollidesCircleWithBlockingWalls(&gs.Props[0].CircleBody, gs.Walls) {
		t.Fatalf("health boost spawned in blocking wall: %#v", gs.Props)
	}
}

func TestDamageToMonsterBuildsSuperChargeForItsAttacker(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("attacker", "Attacker", "Needle")
	gs.State = GameStateGame
	attacker := gs.Players["attacker"]
	target := monster.NewMonster(140, 100, 16, 512, 512, 512)
	gs.Monsters["bat"] = target
	gs.activeSourceID = attacker.PlayerId

	gs.damageMonster("bat", target, 128)

	if attacker.SuperCharge != 25 {
		t.Fatalf("monster damage super charge = %d, want 25", attacker.SuperCharge)
	}
}

func TestMonsterOverkillOnlyChargesSuperForEffectiveDamage(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("attacker", "Attacker", "Needle")
	gs.State = GameStateGame
	attacker := gs.Players["attacker"]
	target := monster.NewMonster(140, 100, 16, 512, 512, 512)
	target.Lives = 50
	gs.Monsters["bat"] = target
	gs.activeSourceID = attacker.PlayerId

	gs.damageMonster("bat", target, 128)

	if attacker.SuperCharge != 10 {
		t.Fatalf("monster overkill super charge = %d, want 10 for 50 effective damage", attacker.SuperCharge)
	}
}
