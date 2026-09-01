package handler

import (
	"battle/deployment"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestReadyTurnsUnavailableDuringDrain(t *testing.T) {
	deployment.Resume()
	h := NewHandler()

	ready := httptest.NewRecorder()
	h.HandleReady(ready, httptest.NewRequest(http.MethodGet, "/ready", nil))
	if ready.Code != http.StatusOK {
		t.Fatalf("ready status = %d, want 200", ready.Code)
	}

	deployment.Begin("maintenance")
	defer deployment.Resume()
	draining := httptest.NewRecorder()
	h.HandleReady(draining, httptest.NewRequest(http.MethodGet, "/ready", nil))
	if draining.Code != http.StatusServiceUnavailable {
		t.Fatalf("draining ready status = %d, want 503", draining.Code)
	}
}

func TestDeploymentAdminRequiresConstantTimeToken(t *testing.T) {
	t.Setenv("DEPLOY_ADMIN_TOKEN", "test-admin-token")
	deployment.Resume()
	h := NewHandler()

	unauthorized := httptest.NewRecorder()
	h.HandleDeploymentStatus(unauthorized, httptest.NewRequest(http.MethodGet, "/admin/deployment/status", nil))
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("unauthorized status = %d, want 401", unauthorized.Code)
	}

	request := httptest.NewRequest(http.MethodPost, "/admin/deployment/drain", nil)
	request.Header.Set("X-Deployment-Token", "test-admin-token")
	started := httptest.NewRecorder()
	h.HandleDeploymentDrain(started, request)
	defer deployment.Resume()
	if started.Code != http.StatusOK || !deployment.IsDraining() {
		t.Fatalf("drain response = %d, draining = %v", started.Code, deployment.IsDraining())
	}
}

func TestDeploymentDrainUsesMessageFromDeployer(t *testing.T) {
	t.Setenv("DEPLOY_ADMIN_TOKEN", "test-admin-token")
	defer deployment.Resume()
	deployment.Resume()
	h := NewHandler()
	request := httptest.NewRequest(
		http.MethodPost,
		"/admin/deployment/drain",
		strings.NewReader(`{"tag":"v0.0.2","message":"Деплой начинается. Бои приостановлены. Ориентировочно через 7 минут."}`),
	)
	request.Header.Set("X-Deployment-Token", "test-admin-token")
	started := httptest.NewRecorder()
	h.HandleDeploymentDrain(started, request)

	if started.Code != http.StatusOK {
		t.Fatalf("drain status = %d, want 200", started.Code)
	}
	if got := deployment.SnapshotState().Message; got != "Деплой начинается. Бои приостановлены. Ориентировочно через 7 минут." {
		t.Fatalf("drain message = %q, want custom deployer message", got)
	}
}
