package game

import (
	"battle/model/gamemap"
	"battle/model/monster"
	"battle/model/player"
	"battle/model/prop"
	"battle/service/geometry"
	"testing"
)

func TestBatLifecycleTelemetryCapturesWorldEvents(t *testing.T) {
	now := int64(10_000)
	gs := &GameState{
		State:    GameStateGame,
		Map:      &gamemap.GameMap{WidthInPixels: 800, HeightInPixels: 800},
		Walls:    geometry.NewSpatialHash(TileSize),
		Players:  map[string]*player.Player{},
		Monsters: map[string]*monster.Monster{},
		clockNow: func() int64 { return now },
	}
	target := &player.Player{CircleBody: geometry.CircleBody{X: 170, Y: 100, Radius: 16}, PlayerId: "p1", Lives: 1_000, MaxLives: 1_000}
	gs.Players[target.PlayerId] = target

	noticeBat := monster.NewMonsterAt(now, 100, 100, 16, 800, 800, monster.MonsterLives)
	gs.Monsters["notice-bat"] = noticeBat
	gs.updateMonsters()
	if noticeBat.State != monster.MonsterNotice {
		t.Fatalf("bat state after acquisition = %s, want notice", noticeBat.State)
	}
	target.X = 700
	gs.updateMonsters()

	target.X, target.Y = 120, 100
	strikeBat := monster.NewMonsterAt(now, 100, 100, 16, 800, 800, 1)
	strikeBat.State = monster.MonsterChase
	strikeBat.TargetPlayerId = target.PlayerId
	strikeBat.LastAttackAt = now - 2_000
	gs.Monsters["strike-bat"] = strikeBat
	gs.updateMonsters()
	if strikeBat.State != monster.MonsterWindup {
		t.Fatalf("bat state before strike = %s, want windup", strikeBat.State)
	}
	now = strikeBat.AttackWindupUntil + 1
	gs.updateMonsters()
	if strikeBat.LastAttackAt != now {
		t.Fatalf("bat strike did not resolve at %d, last attack=%d", now, strikeBat.LastAttackAt)
	}

	target.X, target.Y = 700, 700
	if !gs.damageMonster("strike-bat", strikeBat, 1) {
		t.Fatal("bat was not defeated for reward telemetry")
	}
	respawn, ok := gs.MonsterRespawns["strike-bat"]
	if !ok {
		t.Fatal("bat death did not schedule respawn")
	}
	now = respawn.RespawnAt + 1
	gs.updateMonsters()

	metrics := gs.BatLifecycleMetricsSnapshot()
	if metrics.NoticeStarts != 1 || metrics.NoticeCancels != 1 || metrics.WindupStarts != 1 || metrics.Strikes != 1 || metrics.Rewards != 1 || metrics.Respawns != 1 {
		t.Fatalf("bat lifecycle metrics = %#v, want one complete observed cycle", metrics)
	}
}

func TestRecordBatLifecycleMetricsCreatesAuditableScenarioValues(t *testing.T) {
	gs := &GameState{Mode: ModeTeamDeathmatch}
	gs.batMetrics = BatLifecycleMetrics{
		NoticeStarts: 4, NoticeCancels: 1, WindupStarts: 3,
		Strikes: 2, Rewards: 2, Respawns: 1, RewardClaims: 2, RewardDenials: 1,
		RewardClaimsByRole: map[string]uint64{"Assassin": 1, "Support": 1},
		FirstDamageEvents:  1, ContestStarts: 1, DamageEvents: 3,
		EffectiveDamage: 20, RewardExpiries: 1,
		DamageByRole: map[string]uint64{"Controller": 14},
	}
	runner := NewCombatScenarioRunner("bat-lifecycle", 1, ModeTeamDeathmatch, gs)
	if err := runner.RecordBatLifecycleMetrics("bat"); err != nil {
		t.Fatalf("record bat lifecycle metrics: %v", err)
	}
	report := runner.Report()
	values := make(map[string]float64, len(report.Metrics))
	for _, metric := range report.Metrics {
		values[metric.Name] = metric.Value
	}
	for name, want := range map[string]float64{
		"bat.noticeStarts": 4, "bat.noticeCancels": 1, "bat.windupStarts": 3,
		"bat.strikes": 2, "bat.rewards": 2, "bat.respawns": 1,
		"bat.rewardClaims": 2, "bat.rewardDenials": 1,
		"bat.firstDamageEvents": 1, "bat.contestStarts": 1,
		"bat.damageEvents": 3, "bat.effectiveDamage": 20, "bat.rewardExpiries": 1,
		"bat.noticeToStrikeRate":       .5,
		"bat.rewardClaimRole.Assassin": 1,
		"bat.damageRole.Controller":    14,
	} {
		if values[name] != want {
			t.Fatalf("scenario metric %s = %v, want %v", name, values[name], want)
		}
	}
}

func TestBatTimelineRecordsFirstDamageContestAndRewardExpiry(t *testing.T) {
	now := int64(20_000)
	gs := &GameState{
		Mode:     ModeTeamDeathmatch,
		State:    GameStateGame,
		Players:  map[string]*player.Player{},
		Monsters: map[string]*monster.Monster{},
		Props:    []*prop.Prop{},
		clockNow: func() int64 { return now },
	}
	blue := &player.Player{CircleBody: geometry.CircleBody{X: 100, Y: 100, Radius: 16}, PlayerId: "blue", Team: "Blue", HeroName: "Kaze", Lives: 500, MaxLives: 500}
	red := &player.Player{CircleBody: geometry.CircleBody{X: 120, Y: 100, Radius: 16}, PlayerId: "red", Team: "Red", HeroName: "Needle", Lives: 500, MaxLives: 500}
	gs.Players[blue.PlayerId], gs.Players[red.PlayerId] = blue, red
	bat := monster.NewMonsterAt(now, 140, 100, 16, 800, 800, 20)
	gs.Monsters["bat"] = bat

	if gs.damageMonster("bat", bat, 3, blue.PlayerId) || bat.Lives != 17 {
		t.Fatalf("first bat damage result=%v lives=%d", bat.Lives == 0, bat.Lives)
	}
	if gs.damageMonster("bat", bat, 3, blue.PlayerId) || bat.Lives != 14 {
		t.Fatalf("second bat damage lives=%d", bat.Lives)
	}
	if !gs.damageMonster("bat", bat, 14, red.PlayerId) {
		t.Fatal("red contest damage did not claim the bat")
	}
	reward := gs.Props[0]
	reward.ExpiresAt = now - 1
	gs.expireProps(now)

	metrics := gs.BatLifecycleMetricsSnapshot()
	if metrics.FirstDamageEvents != 1 || metrics.ContestStarts != 1 || metrics.DamageEvents != 3 || metrics.EffectiveDamage != 20 || metrics.RewardExpiries != 1 {
		t.Fatalf("bat timeline metrics = %#v, want first damage, contest, effective damage and expiry", metrics)
	}

	events := gs.BatLifecycleTimelineSnapshot()
	wantKinds := []string{"first_damage", "damage", "damage", "contest", "damage", "reward", "expiry"}
	if len(events) != len(wantKinds) {
		t.Fatalf("bat timeline event count=%d, want %d: %#v", len(events), len(wantKinds), events)
	}
	for index, want := range wantKinds {
		if events[index].Kind != want {
			t.Fatalf("bat timeline event %d kind=%q, want %q: %#v", index, events[index].Kind, want, events)
		}
	}
	if events[0].SourceID != blue.PlayerId || events[3].Team != red.Team || events[4].SourceID != red.PlayerId || events[5].BatID != "bat" || events[5].KillerID != red.PlayerId || events[6].BatID != "bat" {
		t.Fatalf("bat timeline attribution=%#v, want first blue damage, red contest and red reward claimant", events)
	}
}
