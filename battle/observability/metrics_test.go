package observability

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestRegistryWritesCountersGaugesAndHistograms(t *testing.T) {
	registry := NewRegistry()
	registry.IncCounter("battle_test_requests_total", "Test requests", map[string]string{"route": "health"})
	registry.AddCounter("battle_test_requests_total", "Test requests", 2, map[string]string{"route": "health"})
	registry.SetGauge("battle_test_active_rooms", "Active test rooms", 3, nil)
	registry.ObserveHistogram("battle_test_duration_seconds", "Test duration", .012, []float64{.01, .05}, nil)

	record := httptest.NewRecorder()
	registry.ServeHTTP(record, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	body := record.Body.String()

	for _, want := range []string{
		"# TYPE battle_test_requests_total counter",
		"battle_test_requests_total{route=\"health\"} 3",
		"# TYPE battle_test_active_rooms gauge",
		"battle_test_active_rooms 3",
		"battle_test_duration_seconds_bucket{le=\"0.01\"} 0",
		"battle_test_duration_seconds_bucket{le=\"0.05\"} 1",
		"battle_test_duration_seconds_bucket{le=\"+Inf\"} 1",
		"battle_test_duration_seconds_count 1",
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("metrics body missing %q:\n%s", want, body)
		}
	}
}

func TestHTTPMiddlewareRecordsBoundedREDSeries(t *testing.T) {
	registry := NewRegistry()
	handler := HTTPMiddleware(registry, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))

	request := httptest.NewRequest(http.MethodGet, "/health", nil)
	record := httptest.NewRecorder()
	handler.ServeHTTP(record, request)

	metrics := httptest.NewRecorder()
	registry.ServeHTTP(metrics, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	body := metrics.Body.String()
	if !strings.Contains(body, `battle_http_requests_total{method="GET",route="health",status="204"} 1`) {
		t.Fatalf("HTTP counter missing:\n%s", body)
	}
	if !strings.Contains(body, `battle_http_request_duration_seconds_count{method="GET",route="health",status="204"} 1`) {
		t.Fatalf("HTTP duration missing:\n%s", body)
	}
}

func TestRecordBattleTickPublishesOperationalSignals(t *testing.T) {
	registry := NewRegistry()
	RecordBattleTick(registry, BattleTickSample{
		Gap:      17 * time.Millisecond,
		Update:   2 * time.Millisecond,
		Snapshot: 3 * time.Millisecond,
		Queue:    1 * time.Millisecond,
		Updates:  4,
		Bytes:    4096,
		Dropped:  1,
		Slow:     true,
	})

	metrics := httptest.NewRecorder()
	registry.ServeHTTP(metrics, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	body := metrics.Body.String()
	for _, want := range []string{
		"battle_ticks_total 1",
		"battle_state_updates_total 4",
		"battle_state_bytes_total 4096",
		"battle_state_queue_drops_total 1",
		"battle_slow_ticks_total 1",
		"battle_tick_gap_seconds_count 1",
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("battle metric missing %q:\n%s", want, body)
		}
	}
}

func TestRecordBotAIMetricsPublishesBoundedDecisionSignals(t *testing.T) {
	registry := NewRegistry()
	RecordBotAIMetrics(registry, BotAIMetricSample{
		Mode:                  "team deathmatch",
		ActionSelections:      map[string]uint64{"engage": 4, "collect_pickup": 2, "player-123": 99},
		ActionScoreMeans:      map[string]float64{"engage": 42, "player-123": 99},
		ResourceContestByRole: map[string]uint64{"Assassin": 3, "player-123": 99},
		ActionSwitches:        3, HardInterrupts: 2, RetreatDecisions: 1,
		AbilityUses: 5, PeelDecisions: 2, ResourceContestDecisions: 3,
		AttackAttempts: 8, AttackHits: 5,
		SpawnProtectionAvoidances: 4, StuckReplans: 1,
	})

	metrics := httptest.NewRecorder()
	registry.ServeHTTP(metrics, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	body := metrics.Body.String()
	for _, want := range []string{
		`battle_bot_action_selections_total{action="engage",mode="team deathmatch"} 4`,
		`battle_bot_action_selections_total{action="collect_pickup",mode="team deathmatch"} 2`,
		`battle_bot_action_switches_total{mode="team deathmatch"} 3`,
		`battle_bot_resource_contest_decisions_total{mode="team deathmatch"} 3`,
		`battle_bot_bat_contest_responses_total{mode="team deathmatch",role="Assassin"} 3`,
		`battle_bot_attack_attempts_total{mode="team deathmatch"} 8`,
		`battle_bot_attack_hits_total{mode="team deathmatch"} 5`,
		`battle_bot_spawn_protection_avoids_total{mode="team deathmatch"} 4`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("bot metric missing %q:\n%s", want, body)
		}
	}
	if strings.Contains(body, "player-123") {
		t.Fatalf("unbounded action label leaked into bot metrics:\n%s", body)
	}
	if !strings.Contains(body, "battle_bot_action_score") || !strings.Contains(body, `action="engage"`) {
		t.Fatalf("bounded action score gauge missing:\n%s", body)
	}
}

func TestRecordBatLifecycleMetricsPublishesBoundedWorldSignals(t *testing.T) {
	registry := NewRegistry()
	RecordBatLifecycleMetrics(registry, BatLifecycleMetricSample{
		Mode: "team deathmatch", NoticeStarts: 4, NoticeCancels: 1,
		WindupStarts: 3, Strikes: 2, Rewards: 2, Respawns: 1,
		RewardClaims: 1, RewardDenials: 2,
		RewardClaimsByRole: map[string]uint64{"Assassin": 1, "player-123": 99},
		FirstDamageEvents:  1, ContestStarts: 1, DamageEvents: 3,
		EffectiveDamage: 20, RewardExpiries: 1,
		DamageByRole: map[string]uint64{"Controller": 14, "player-123": 99},
	})

	metrics := httptest.NewRecorder()
	registry.ServeHTTP(metrics, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	body := metrics.Body.String()
	for _, want := range []string{
		`battle_bat_notice_starts_total{mode="team deathmatch"} 4`,
		`battle_bat_notice_cancels_total{mode="team deathmatch"} 1`,
		`battle_bat_windup_starts_total{mode="team deathmatch"} 3`,
		`battle_bat_strikes_total{mode="team deathmatch"} 2`,
		`battle_bat_rewards_total{mode="team deathmatch"} 2`,
		`battle_bat_respawns_total{mode="team deathmatch"} 1`,
		`battle_bat_reward_claims_total{mode="team deathmatch"} 1`,
		`battle_bat_reward_denials_total{mode="team deathmatch"} 2`,
		`battle_bat_reward_claims_by_role_total{mode="team deathmatch",role="Assassin"} 1`,
		`battle_bat_first_damage_events_total{mode="team deathmatch"} 1`,
		`battle_bat_contest_starts_total{mode="team deathmatch"} 1`,
		`battle_bat_damage_events_total{mode="team deathmatch"} 3`,
		`battle_bat_effective_damage_total{mode="team deathmatch"} 20`,
		`battle_bat_reward_expiries_total{mode="team deathmatch"} 1`,
		`battle_bat_damage_by_role_total{mode="team deathmatch",role="Controller"} 14`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("bat lifecycle metric missing %q:\n%s", want, body)
		}
	}
}
