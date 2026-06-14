package handler

import (
	"bytes"
	"encoding/json"
	"leaderboard/model"
	"leaderboard/provider"
	"leaderboard/service"
	"net/http"
	"net/http/httptest"
	"testing"
)

func setupHandler(t *testing.T) (*Handler, *provider.MockStore) {
	t.Helper()
	store := provider.NewMockStore()
	svc := service.New(store)
	h := NewHandler(svc)
	return h, store
}

func TestHandleHealth(t *testing.T) {
	h, _ := setupHandler(t)
	req := httptest.NewRequest("GET", "/health", nil)
	w := httptest.NewRecorder()

	h.HandleHealth(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", w.Code)
	}
	var body map[string]string
	json.Unmarshal(w.Body.Bytes(), &body)
	if body["status"] != "ok" {
		t.Errorf("status = %q, want ok", body["status"])
	}
}

func TestHandleLeaderboard_Empty(t *testing.T) {
	h, _ := setupHandler(t)
	req := httptest.NewRequest("GET", "/leaderboard", nil)
	w := httptest.NewRecorder()

	h.HandleLeaderboard(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", w.Code)
	}
	var body []interface{}
	json.Unmarshal(w.Body.Bytes(), &body)
	if len(body) != 0 {
		t.Errorf("len = %d, want 0", len(body))
	}
}

func TestHandleLeaderboard_WithData(t *testing.T) {
	h, store := setupHandler(t)

	store.Save(&model.Score{PlayerId: "p1", Name: "Alice", Score: 100})
	store.Save(&model.Score{PlayerId: "p2", Name: "Bob", Score: 200})

	req := httptest.NewRequest("GET", "/leaderboard", nil)
	w := httptest.NewRecorder()

	h.HandleLeaderboard(w, req)

	var body []model.Score
	json.Unmarshal(w.Body.Bytes(), &body)
	if len(body) != 2 {
		t.Fatalf("len = %d, want 2", len(body))
	}
	if body[0].Score < body[1].Score {
		t.Error("expected descending order")
	}
}

func TestHandleLeaderboard_WithLimit(t *testing.T) {
	h, store := setupHandler(t)

	for i := 0; i < 10; i++ {
		store.Save(&model.Score{PlayerId: "p" + string(rune('A'+i)), Score: i * 100})
	}

	req := httptest.NewRequest("GET", "/leaderboard?limit=3", nil)
	w := httptest.NewRecorder()

	h.HandleLeaderboard(w, req)

	var body []model.Score
	json.Unmarshal(w.Body.Bytes(), &body)
	if len(body) != 3 {
		t.Errorf("len = %d, want 3", len(body))
	}
}

func TestHandleUpdateScore_Success(t *testing.T) {
	h, store := setupHandler(t)

	payload := `{"playerId":"p1","name":"Alice","score":500,"wins":1,"games":3}`
	req := httptest.NewRequest("POST", "/leaderboard/score", bytes.NewBufferString(payload))
	w := httptest.NewRecorder()

	h.HandleUpdateScore(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", w.Code)
	}
	if store.Count() != 1 {
		t.Errorf("store count = %d, want 1", store.Count())
	}
}

func TestHandleUpdateScore_BadJSON(t *testing.T) {
	h, _ := setupHandler(t)

	req := httptest.NewRequest("POST", "/leaderboard/score", bytes.NewBufferString("not json"))
	w := httptest.NewRecorder()

	h.HandleUpdateScore(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestHandleUpdateScore_MissingPlayerId(t *testing.T) {
	h, _ := setupHandler(t)

	payload := `{"name":"Alice","score":100}`
	req := httptest.NewRequest("POST", "/leaderboard/score", bytes.NewBufferString(payload))
	w := httptest.NewRecorder()

	h.HandleUpdateScore(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestHandleUpdateScore_WrongMethod(t *testing.T) {
	h, _ := setupHandler(t)

	req := httptest.NewRequest("GET", "/leaderboard/score", nil)
	w := httptest.NewRecorder()

	h.HandleUpdateScore(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("status = %d, want 405", w.Code)
	}
}

func TestHandleGetPlayer_Found(t *testing.T) {
	h, store := setupHandler(t)

	store.Save(&model.Score{PlayerId: "p1", Name: "Alice", Score: 42})

	req := httptest.NewRequest("GET", "/leaderboard/player/p1", nil)
	w := httptest.NewRecorder()

	h.HandleGetPlayer(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", w.Code)
	}
	var body model.Score
	json.Unmarshal(w.Body.Bytes(), &body)
	if body.Score != 42 {
		t.Errorf("Score = %d, want 42", body.Score)
	}
}

func TestHandleGetPlayer_NotFound(t *testing.T) {
	h, _ := setupHandler(t)

	req := httptest.NewRequest("GET", "/leaderboard/player/nobody", nil)
	w := httptest.NewRecorder()

	h.HandleGetPlayer(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("status = %d, want 404", w.Code)
	}
}

func TestHandleGetPlayer_EmptyId(t *testing.T) {
	h, _ := setupHandler(t)

	req := httptest.NewRequest("GET", "/leaderboard/player/", nil)
	w := httptest.NewRecorder()

	h.HandleGetPlayer(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}
