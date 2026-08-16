package main

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func TestPartyInvitationsAndHeroMembership(t *testing.T) {
	s := newStore()
	s.mu.Lock()
	p := s.createParty("1", "Leader", 3)
	invite, err := s.addInvite("1", "Leader", p.ID, "2")
	if err != nil {
		t.Fatal(err)
	}
	s.cacheInvite(invite)
	joined, err := s.accept(invite.ID, "2")
	s.mu.Unlock()
	if err != nil {
		t.Fatal(err)
	}
	if len(joined.Members) != 2 {
		t.Fatalf("members = %d", len(joined.Members))
	}
	s.mu.Lock()
	joined, err = s.setHero(p.ID, "2", "Needle")
	s.mu.Unlock()
	if err != nil || joined.Members[1].Hero != "Needle" {
		t.Fatalf("hero update failed: %+v", joined)
	}
}

func TestBattleResultBuildsRecentTeammatesAndHistory(t *testing.T) {
	s := newStore()
	s.recordResult(battleResult{RoomID: "room-1", EndedAt: 100, Winner: "Red team", Players: []struct {
		PlayerID string `json:"playerId"`
		Name     string `json:"name"`
		PartyID  string `json:"partyId"`
		Team     string `json:"team"`
		Won      bool   `json:"won"`
	}{
		{PlayerID: "1", Name: "One", PartyID: "p", Team: "Red", Won: true},
		{PlayerID: "2", Name: "Two", PartyID: "p", Team: "Red", Won: true},
	}})
	if got := s.recentFor("1", 1); len(got) != 1 || got[0].PlayerID != "2" || got[0].Wins != 1 {
		t.Fatalf("recent = %+v", got)
	}
	if got := s.historyFor("1", 1); len(got) != 1 || got[0].PartyID != "p" || !got[0].Members[1].Won {
		t.Fatalf("history = %+v", got)
	}
}

func TestInviteExpiresFromPendingCache(t *testing.T) {
	s := newStore()
	s.cacheInvite(&Invite{ID: "i", ToID: "2", Status: "pending", ExpiresAt: 1})
	if got := s.pending("2"); len(got) != 0 {
		t.Fatalf("expired invites = %+v", got)
	}
}

func TestLookupPlayerUsesAccountProfile(t *testing.T) {
	account := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/users/42/profile" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"full_name":"Alice","username":"alice"}`))
	}))
	defer account.Close()

	name, err := (&server{accountURL: account.URL}).lookupPlayer("42")
	if err != nil || name != "Alice" {
		t.Fatalf("lookup = %q, err=%v", name, err)
	}
}

func TestLookupPlayerRejectsMissingAccount(t *testing.T) {
	account := httptest.NewServer(http.NotFoundHandler())
	defer account.Close()
	if _, err := (&server{accountURL: account.URL}).lookupPlayer("404"); err == nil {
		t.Fatal("missing account player should be rejected")
	}
}

func TestPartyStoreSurvivesReload(t *testing.T) {
	path := filepath.Join(t.TempDir(), "party-store.json")
	first := loadStore(path)
	first.mu.Lock()
	party := first.createParty("1", "Leader", 3)
	first.mu.Unlock()

	second := loadStore(path)
	second.mu.RLock()
	deferred := second.parties[party.ID]
	second.mu.RUnlock()
	if deferred == nil || deferred.OwnerID != "1" {
		t.Fatalf("reloaded party = %+v", deferred)
	}
}
