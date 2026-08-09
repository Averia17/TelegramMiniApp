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
