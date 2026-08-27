package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

func signedPartyToken(t *testing.T, subject string) string {
	t.Helper()
	secret := "party-test-secret"
	t.Setenv("APP_AUTH_SECRET", secret)
	t.Setenv("ENVIRONMENT", "production")
	payload := base64.RawURLEncoding.EncodeToString([]byte(subject))
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(payload))
	return payload + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func TestUserIDAcceptsNumericAccessTokenSubject(t *testing.T) {
	token := signedPartyToken(t, `{"sub":42,"exp":`+strconv.FormatInt(time.Now().Add(time.Hour).Unix(), 10)+`}`)
	request := httptest.NewRequest(http.MethodGet, "/party/ws", nil)
	request.Header.Set("Authorization", "Bearer "+token)

	if got := userID(request); got != "42" {
		t.Fatalf("userID = %q, want numeric subject converted to string", got)
	}
}

func TestProductionIdentityCheckIsCaseInsensitive(t *testing.T) {
	t.Setenv("ENVIRONMENT", "Production")
	request := httptest.NewRequest(http.MethodGet, "/party/mine", nil)
	request.Header.Set("X-User-ID", "spoofed")

	if got := userID(request); got != "" {
		t.Fatalf("userID trusted development header in production: %q", got)
	}
}

func TestDecodeRejectsMultipleJSONValues(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/party", strings.NewReader(`{"name":"one"} {"name":"two"}`))
	var value map[string]string
	if err := decode(request, &value); err == nil {
		t.Fatal("decode accepted multiple JSON values")
	}
}

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
	if joined.Revision <= p.Revision {
		t.Fatalf("party revision did not increase after join: before=%d after=%d", p.Revision, joined.Revision)
	}
	joinedRevision := joined.Revision
	s.mu.Lock()
	joined, err = s.setHero(p.ID, "2", "Needle")
	s.mu.Unlock()
	if err != nil || joined.Members[1].Hero != "Needle" {
		t.Fatalf("hero update failed: %+v", joined)
	}
	if joined.Revision <= joinedRevision {
		t.Fatalf("party revision did not increase after hero selection: before=%d after=%d", joinedRevision, joined.Revision)
	}
}

func TestAcceptingInviteMovesPlayerAndKeepsSourcePartyWithTwoMembers(t *testing.T) {
	s := newStore()
	s.mu.Lock()
	source := s.createParty("1", "Source Leader", 3)
	s.parties[source.ID].Members = append(s.parties[source.ID].Members,
		Member{PlayerID: "2", Name: "Moving Player"},
		Member{PlayerID: "4", Name: "Remaining Friend"},
	)
	target := s.createParty("3", "Target Leader", 3)
	invite, err := s.addInvite("3", "Target Leader", target.ID, "2")
	if err == nil {
		s.cacheInvite(invite)
		_, err = s.accept(invite.ID, "2", "Moving Player")
	}
	updatedSource := s.parties[source.ID]
	updatedTarget := s.parties[target.ID]
	s.mu.Unlock()

	if err != nil {
		t.Fatal(err)
	}
	if updatedSource == nil || len(updatedSource.Members) != 2 {
		t.Fatalf("source party after transfer = %+v, want two remaining members", updatedSource)
	}
	for _, member := range updatedSource.Members {
		if member.PlayerID == "2" {
			t.Fatalf("transferred player remains in source party = %+v", updatedSource)
		}
	}
	if updatedTarget == nil || len(updatedTarget.Members) != 2 || updatedTarget.Members[1].PlayerID != "2" {
		t.Fatalf("target party after transfer = %+v, want transferred player", updatedTarget)
	}
}

func TestAcceptingInviteDisbandsEmptySourceAndInvalidatesItsInvites(t *testing.T) {
	s := newStore()
	s.mu.Lock()
	source := s.createParty("2", "Source Leader", 3)
	sourceInvite, err := s.addInvite("2", "Source Leader", source.ID, "4")
	if err == nil {
		s.cacheInvite(sourceInvite)
	}
	target := s.createParty("3", "Target Leader", 3)
	targetInvite, targetErr := s.addInvite("3", "Target Leader", target.ID, "2")
	if targetErr == nil {
		s.cacheInvite(targetInvite)
		_, targetErr = s.accept(targetInvite.ID, "2", "Source Leader")
	}
	remainingSource := s.parties[source.ID]
	storedSourceInvite := s.invitations[sourceInvite.ID]
	s.mu.Unlock()

	if err != nil || targetErr != nil {
		t.Fatalf("invite transition errors = %v, %v", err, targetErr)
	}
	if remainingSource != nil {
		t.Fatalf("empty source party was retained = %+v", remainingSource)
	}
	if storedSourceInvite.Status != "invalid" || storedSourceInvite.InvalidReason != "party_disbanded" {
		t.Fatalf("source invite = %+v, want invalid party-disbanded invite", storedSourceInvite)
	}
}

func TestCreatePartyDoesNotDuplicateExistingMember(t *testing.T) {
	s := newStore()
	s.mu.Lock()
	first := s.createParty("1", "Leader", 3)
	second := s.createParty("1", "Leader", 3)
	s.mu.Unlock()

	if first.ID != second.ID || len(s.parties) != 1 {
		t.Fatalf("duplicate party created for member: first=%+v second=%+v parties=%d", first, second, len(s.parties))
	}
}

func TestLoadStoreRepairsDuplicateMemberships(t *testing.T) {
	path := filepath.Join(t.TempDir(), "party-store.json")
	snapshot := storeSnapshot{Parties: map[string]*Party{
		"party-a": {ID: "party-a", OwnerID: "1", MaxSize: 3, Members: []Member{{PlayerID: "1", Owner: true}, {PlayerID: "2"}}},
		"party-b": {ID: "party-b", OwnerID: "2", MaxSize: 3, Members: []Member{{PlayerID: "2", Owner: true}, {PlayerID: "3"}}},
	}, Invitations: map[string]*Invite{
		"invite-b": {ID: "invite-b", PartyID: "party-b", ToID: "4", Status: "pending", ExpiresAt: time.Now().Add(time.Minute).UnixMilli()},
	}}
	data, err := json.Marshal(snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}

	s := loadStore(path)
	if got := s.partyFor("2"); got == nil || got.ID != "party-a" {
		t.Fatalf("player 2 party = %+v, want repaired first party", got)
	}
	if party := s.parties["party-b"]; party == nil || len(party.Members) != 1 || party.Members[0].PlayerID != "3" || party.OwnerID != "3" {
		t.Fatalf("repaired second party = %+v", party)
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

func TestNewInviteExpiresAfterFiveMinutes(t *testing.T) {
	s := newStore()
	s.mu.Lock()
	party := s.createParty("1", "Leader", 3)
	invite, err := s.addInvite("1", "Leader", party.ID, "2")
	s.mu.Unlock()
	if err != nil {
		t.Fatal(err)
	}
	remaining := invite.ExpiresAt - invite.CreatedAt
	if remaining != int64(5*time.Minute/time.Millisecond) {
		t.Fatalf("invite lifetime = %dms, want %dms", remaining, 5*time.Minute/time.Millisecond)
	}
}

func TestActiveInviteBlocksDuplicateRecipientUntilInvalid(t *testing.T) {
	s := newStore()
	s.mu.Lock()
	firstParty := s.createParty("1", "Leader", 3)
	first, err := s.addInvite("1", "Leader", firstParty.ID, "2")
	if err == nil {
		s.cacheInvite(first)
	}
	secondParty := s.createParty("3", "Other", 3)
	_, duplicateErr := s.addInvite("3", "Other", secondParty.ID, "2")
	s.mu.Unlock()
	if duplicateErr == nil || duplicateErr.Error() != "player already has an active invite" {
		t.Fatalf("duplicate invite error = %v, want active invite conflict", duplicateErr)
	}

	s.mu.Lock()
	if _, err = s.cancel(first.ID, "1"); err != nil {
		s.mu.Unlock()
		t.Fatal(err)
	}
	replacement, err := s.addInvite("3", "Other", secondParty.ID, "2")
	s.mu.Unlock()
	if err != nil {
		t.Fatalf("replacement invite failed after invalidation: %v", err)
	}
	if replacement.ToID != "2" || replacement.Status != "pending" {
		t.Fatalf("replacement invite = %+v", replacement)
	}
}

func TestCancelInviteMarksItCanceledForBothSides(t *testing.T) {
	s := newStore()
	s.mu.Lock()
	party := s.createParty("1", "Leader", 3)
	invite, err := s.addInvite("1", "Leader", party.ID, "2")
	if err == nil {
		s.cacheInvite(invite)
		invite, err = s.cancel(invite.ID, "1")
	}
	s.mu.Unlock()
	if err != nil {
		t.Fatal(err)
	}
	if invite.Status != "invalid" || invite.InvalidReason != "canceled" || invite.RespondedAt == 0 {
		t.Fatalf("invalid invite = %+v", invite)
	}

	s.mu.RLock()
	inbox := s.inbox("2")
	s.mu.RUnlock()
	if len(inbox) != 1 || inbox[0].Status != "invalid" || inbox[0].InvalidReason != "canceled" {
		t.Fatalf("recipient inbox = %+v, want canceled invite", inbox)
	}
}

func TestCancelInviteRejectsRecipientAndExpiredInvite(t *testing.T) {
	s := newStore()
	s.mu.Lock()
	party := s.createParty("1", "Leader", 3)
	invite, err := s.addInvite("1", "Leader", party.ID, "2")
	if err == nil {
		s.cacheInvite(invite)
		if _, err = s.cancel(invite.ID, "2"); err == nil {
			t.Fatal("recipient should not cancel an invite")
		}
		invite.ExpiresAt = time.Now().Add(-time.Second).UnixMilli()
		if _, err = s.cancel(invite.ID, "1"); err == nil {
			t.Fatal("expired invite should not be cancelable")
		}
	}
	s.mu.Unlock()
	if err == nil {
		t.Fatal("expected cancel validation error")
	}
}

func TestPartyHTTPCancelNotifiesAndExposesCanceledInbox(t *testing.T) {
	s := newStore()
	s.mu.Lock()
	party := s.createParty("1", "Leader", 3)
	invite, err := s.addInvite("1", "Leader", party.ID, "2")
	if err == nil {
		s.cacheInvite(invite)
	}
	s.mu.Unlock()
	if err != nil {
		t.Fatal(err)
	}
	srv := &server{state: s, maxPartySize: 3, hub: newInviteHub()}
	t.Setenv("ENVIRONMENT", "development")

	cancel := httptest.NewRequest(http.MethodPost, "/party/invites/"+invite.ID+"/cancel", nil)
	cancel.Header.Set("X-User-ID", "1")
	canceled := httptest.NewRecorder()
	srv.ServeHTTP(canceled, cancel)
	if canceled.Code != http.StatusOK {
		t.Fatalf("cancel status = %d, body=%s", canceled.Code, canceled.Body.String())
	}

	inbox := httptest.NewRequest(http.MethodGet, "/party/invites/inbox", nil)
	inbox.Header.Set("X-User-ID", "2")
	inboxResponse := httptest.NewRecorder()
	srv.ServeHTTP(inboxResponse, inbox)
	if inboxResponse.Code != http.StatusOK {
		t.Fatalf("inbox status = %d", inboxResponse.Code)
	}
	var items []Invite
	if err := json.NewDecoder(inboxResponse.Body).Decode(&items); err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].Status != "invalid" || items[0].InvalidReason != "canceled" {
		t.Fatalf("inbox = %+v, want canceled invite", items)
	}
}

func TestPartyHTTPRejectsDuplicateInviteUntilCanceled(t *testing.T) {
	s := newStore()
	s.mu.Lock()
	party := s.createParty("1", "Leader", 3)
	s.parties[party.ID].Members = append(s.parties[party.ID].Members, Member{PlayerID: "4", Name: "Existing Friend"})
	s.mu.Unlock()
	srv := &server{state: s, maxPartySize: 3, hub: newInviteHub()}
	t.Setenv("ENVIRONMENT", "development")

	sendInvite := func() *httptest.ResponseRecorder {
		request := httptest.NewRequest(http.MethodPost, "/party/"+party.ID+"/invites", strings.NewReader(`{"playerId":"2"}`))
		request.Header.Set("X-User-ID", "1")
		response := httptest.NewRecorder()
		srv.ServeHTTP(response, request)
		return response
	}

	firstResponse := sendInvite()
	if firstResponse.Code != http.StatusCreated {
		t.Fatalf("first invite status = %d, body=%s", firstResponse.Code, firstResponse.Body.String())
	}
	var first Invite
	if err := json.NewDecoder(firstResponse.Body).Decode(&first); err != nil {
		t.Fatal(err)
	}

	duplicateResponse := sendInvite()
	if duplicateResponse.Code != http.StatusConflict || !strings.Contains(duplicateResponse.Body.String(), "active invite") {
		t.Fatalf("duplicate invite status = %d, body=%s", duplicateResponse.Code, duplicateResponse.Body.String())
	}

	cancel := httptest.NewRequest(http.MethodPost, "/party/invites/"+first.ID+"/cancel", nil)
	cancel.Header.Set("X-User-ID", "1")
	canceled := httptest.NewRecorder()
	srv.ServeHTTP(canceled, cancel)
	if canceled.Code != http.StatusOK {
		t.Fatalf("cancel status = %d, body=%s", canceled.Code, canceled.Body.String())
	}

	replacementResponse := sendInvite()
	if replacementResponse.Code != http.StatusCreated {
		t.Fatalf("replacement invite status = %d, body=%s", replacementResponse.Code, replacementResponse.Body.String())
	}
}

func TestExpiredInviteBecomesInvalidAndStaysInInbox(t *testing.T) {
	s := newStore()
	s.mu.Lock()
	s.cacheInvite(&Invite{ID: "expired", ToID: "2", Status: "pending", CreatedAt: 1, ExpiresAt: 1})
	invalidated := s.invalidateExpiredLocked(2)
	s.mu.Unlock()
	if len(invalidated) != 1 || invalidated[0].Status != "invalid" || invalidated[0].InvalidReason != "expired" {
		t.Fatalf("invalidated = %+v", invalidated)
	}
	s.mu.RLock()
	inbox := s.inbox("2")
	s.mu.RUnlock()
	if len(inbox) != 1 || inbox[0].Status != "invalid" {
		t.Fatalf("expired inbox = %+v, want retained invalid invite", inbox)
	}
}

func TestDisbandedPartyInvalidatesItsPendingInvites(t *testing.T) {
	s := newStore()
	s.mu.Lock()
	party := s.createParty("1", "Leader", 3)
	invite, err := s.addInvite("1", "Leader", party.ID, "2")
	if err == nil {
		s.cacheInvite(invite)
	}
	invalidated := s.invalidatePartyInvitesLocked(party.ID, "party_disbanded")
	s.mu.Unlock()
	if err != nil {
		t.Fatal(err)
	}
	if len(invalidated) != 1 || invalidated[0].Status != "invalid" || invalidated[0].InvalidReason != "party_disbanded" {
		t.Fatalf("invalidated = %+v", invalidated)
	}
}

func TestAcceptAfterOriginalPartyDisappearsInvalidatesInvite(t *testing.T) {
	s := newStore()
	s.mu.Lock()
	party := s.createParty("1", "Leader", 3)
	invite, err := s.addInvite("1", "Leader", party.ID, "2")
	if err == nil {
		s.cacheInvite(invite)
		delete(s.parties, party.ID)
		_, err = s.accept(invite.ID, "2")
	}
	stored := s.invitations[invite.ID]
	s.mu.Unlock()

	if err == nil || err.Error() != "invite is invalid" {
		t.Fatalf("accept error = %v, want invalid invite", err)
	}
	if stored.Status != "invalid" || stored.InvalidReason != "party_disbanded" || stored.RespondedAt == 0 {
		t.Fatalf("stored invite = %+v, want invalid party-disbanded invite", stored)
	}
}

func TestMissingPartyInvalidatesPendingInvitesDuringSweep(t *testing.T) {
	s := newStore()
	s.mu.Lock()
	party := s.createParty("1", "Leader", 3)
	invite, err := s.addInvite("1", "Leader", party.ID, "2")
	if err == nil {
		s.cacheInvite(invite)
		delete(s.parties, party.ID)
		invalidated := s.invalidateOrphanedPartyInvitesLocked()
		if len(invalidated) != 1 || invalidated[0].ID != invite.ID {
			s.mu.Unlock()
			t.Fatalf("invalidated invites = %+v, want original invite", invalidated)
		}
	}
	stored := s.invitations[invite.ID]
	s.mu.Unlock()

	if err != nil {
		t.Fatal(err)
	}
	if stored.Status != "invalid" || stored.InvalidReason != "party_disbanded" {
		t.Fatalf("stored invite = %+v, want invalid party-disbanded invite", stored)
	}
}

func TestSoloPartyDisbandsAfterTheLastInviteIsDeclined(t *testing.T) {
	s := newStore()
	s.mu.Lock()
	party := s.createParty("1", "Leader", 3)
	first, err := s.addInvite("1", "Leader", party.ID, "2")
	if err == nil {
		s.cacheInvite(first)
	}
	second, secondErr := s.addInvite("1", "Leader", party.ID, "3")
	if secondErr == nil {
		s.cacheInvite(second)
	}
	s.mu.Unlock()
	if err != nil || secondErr != nil {
		t.Fatalf("invite creation errors = %v, %v", err, secondErr)
	}

	srv := &server{state: s, maxPartySize: 3, hub: newInviteHub()}
	t.Setenv("ENVIRONMENT", "development")
	resolve := func(inviteID, action, playerID string) {
		request := httptest.NewRequest(http.MethodPost, "/party/invites/"+inviteID+"/"+action, nil)
		request.Header.Set("X-User-ID", playerID)
		response := httptest.NewRecorder()
		srv.ServeHTTP(response, request)
		if response.Code != http.StatusOK {
			t.Fatalf("%s %s status = %d, body=%s", action, inviteID, response.Code, response.Body.String())
		}
	}

	resolve(first.ID, "cancel", "1")
	s.mu.RLock()
	remaining := s.partyFor("1")
	s.mu.RUnlock()
	if remaining == nil {
		t.Fatal("party was disbanded while another invite was pending")
	}

	resolve(second.ID, "decline", "3")
	s.mu.RLock()
	disbanded := s.partyFor("1")
	s.mu.RUnlock()
	if disbanded != nil {
		t.Fatalf("solo party after last decline = %+v, want nil", disbanded)
	}
}

func TestSoloPartyDisbandsAfterTheLastInviteExpires(t *testing.T) {
	s := newStore()
	s.mu.Lock()
	party := s.createParty("1", "Leader", 3)
	invite, err := s.addInvite("1", "Leader", party.ID, "2")
	if err == nil {
		invite.ExpiresAt = time.Now().Add(-time.Second).UnixMilli()
		s.cacheInvite(invite)
	}
	s.mu.Unlock()
	if err != nil {
		t.Fatal(err)
	}

	srv := &server{state: s, hub: newInviteHub()}
	srv.sweepExpiredInvites()

	s.mu.RLock()
	disbanded := s.partyFor("1")
	stored := s.invitations[invite.ID]
	s.mu.RUnlock()
	if disbanded != nil {
		t.Fatalf("solo party after invite expiry = %+v, want nil", disbanded)
	}
	if stored.Status != "invalid" || stored.InvalidReason != "expired" {
		t.Fatalf("expired invite = %+v, want invalid expired invite", stored)
	}
}

func TestOutgoingInvitesKeepDeclinedInviteForFiveSeconds(t *testing.T) {
	s := newStore()
	now := time.Now().UnixMilli()
	s.cacheInvite(&Invite{ID: "pending", FromID: "1", ToID: "2", Status: "pending", ExpiresAt: now + int64(time.Minute/time.Millisecond)})
	s.cacheInvite(&Invite{ID: "declined", FromID: "1", ToID: "3", Status: "declined", RespondedAt: now - int64(4*time.Second/time.Millisecond)})
	s.cacheInvite(&Invite{ID: "old", FromID: "1", ToID: "4", Status: "declined", RespondedAt: now - int64(6*time.Second/time.Millisecond)})

	got := s.outgoing("1")
	if len(got) != 2 || got[0].ID != "pending" || got[1].ID != "declined" {
		t.Fatalf("outgoing invites = %+v, want pending and recent declined", got)
	}
}

func TestDeclineRecordsInviteResponseTime(t *testing.T) {
	s := newStore()
	s.mu.Lock()
	party := s.createParty("1", "Leader", 3)
	invite, err := s.addInvite("1", "Leader", party.ID, "2")
	if err != nil {
		s.mu.Unlock()
		t.Fatal(err)
	}
	s.cacheInvite(invite)
	before := time.Now().UnixMilli()
	err = s.decline(invite.ID, "2")
	stored := s.invitations[invite.ID]
	s.mu.Unlock()
	if err != nil {
		t.Fatal(err)
	}
	if stored.RespondedAt < before || stored.Status != "declined" {
		t.Fatalf("stored invite = %+v, want declined response timestamp", stored)
	}
}

func TestLookupPlayerUsesAccountProfile(t *testing.T) {
	account := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/users/42/profile" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"full_name":"Alice","username":"alice","nickname":"ArenaFox"}`))
	}))
	defer account.Close()

	name, err := (&server{accountURL: account.URL}).lookupPlayer("42")
	if err != nil || name != "ArenaFox" {
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

func TestLookupPlayersUsesAccountSearch(t *testing.T) {
	account := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/users/search" || r.URL.Query().Get("query") != "ArenaFox" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[{"player_id":12301,"username":"alice","full_name":"Alice","nickname":"ArenaFox"}]`))
	}))
	defer account.Close()

	players, err := (&server{accountURL: account.URL}).lookupPlayers("ArenaFox")
	if err != nil {
		t.Fatal(err)
	}
	if len(players) != 1 || players[0].PlayerID != "12301" || players[0].Name != "ArenaFox" {
		t.Fatalf("players = %+v", players)
	}
}

func TestPartySearchReturnsPlayerList(t *testing.T) {
	account := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[{"player_id":12301,"username":"alice","full_name":"Alice"},{"player_id":12344,"username":"bob","full_name":"Bob"}]`))
	}))
	defer account.Close()

	srv := &server{state: newStore(), maxPartySize: 3, hub: newInviteHub(), accountURL: account.URL}
	t.Setenv("ENVIRONMENT", "development")
	request := httptest.NewRequest(http.MethodGet, "/party/search?playerId=123", nil)
	request.Header.Set("X-User-ID", "999")
	response := httptest.NewRecorder()
	srv.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("search status = %d, body=%s", response.Code, response.Body.String())
	}
	var players []map[string]string
	if err := json.NewDecoder(response.Body).Decode(&players); err != nil {
		t.Fatal(err)
	}
	if len(players) != 2 || players[1]["playerId"] != "12344" {
		t.Fatalf("players = %+v", players)
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

func TestPartyViewIssuesBattleTicketOnlyToActiveMember(t *testing.T) {
	t.Setenv("APP_AUTH_SECRET", "party-ticket-test-secret-0123456789")
	party := &Party{
		ID:              "party-1",
		BattleNonce:     "battle-1",
		BattleStartedAt: time.Now().UnixMilli(),
		Members:         []Member{{PlayerID: "1"}, {PlayerID: "2"}},
	}

	memberView := partyViewFor(party, "1")
	if memberView.BattleTicket == "" {
		t.Fatal("active party member did not receive a battle ticket")
	}
	claims, err := decodeBattleTicket(memberView.BattleTicket)
	if err != nil {
		t.Fatalf("decode battle ticket: %v", err)
	}
	if claims.PartyID != party.ID || claims.PlayerID != "1" || claims.Nonce != party.BattleNonce {
		t.Fatalf("battle ticket claims = %+v", claims)
	}

	if outsiderView := partyViewFor(party, "3"); outsiderView.BattleTicket != "" {
		t.Fatal("non-member received a battle ticket")
	}
	if publicView := partyView(party); publicView.BattleTicket != "" {
		t.Fatal("public party view exposed a battle ticket")
	}
}

func TestPartyStoreFindsActivePartyForMember(t *testing.T) {
	s := newStore()
	s.mu.Lock()
	party := s.createParty("1", "Leader", 3)
	joined, err := s.accept("missing", "2")
	s.mu.Unlock()
	if err == nil || joined != nil {
		t.Fatal("missing invite should not join a party")
	}

	s.mu.RLock()
	active := s.partyFor("1")
	s.mu.RUnlock()
	if active == nil || active.ID != party.ID || len(active.Members) != 1 {
		t.Fatalf("active party = %+v, want party %s with one member", active, party.ID)
	}
}

func TestPartyStoreLeaveDisbandsPartyWhenTwoPlayersRemain(t *testing.T) {
	s := newStore()
	s.mu.Lock()
	party := s.createParty("1", "Leader", 3)
	invite, err := s.addInvite("1", "Leader", party.ID, "2")
	if err != nil {
		s.mu.Unlock()
		t.Fatal(err)
	}
	s.cacheInvite(invite)
	if _, err = s.accept(invite.ID, "2", "Friend"); err != nil {
		s.mu.Unlock()
		t.Fatal(err)
	}
	updated, err := s.leave(party.ID, "1")
	s.mu.Unlock()
	if err != nil {
		t.Fatal(err)
	}
	if updated != nil {
		t.Fatalf("party after owner leaves a two-player party = %+v, want nil", updated)
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	if remaining := s.partyFor("2"); remaining != nil {
		t.Fatalf("remaining player still belongs to party = %+v, want no party", remaining)
	}
}

func TestPartyStoreAnyMemberCanInvite(t *testing.T) {
	s := newStore()
	s.mu.Lock()
	party := s.createParty("1", "Leader", 3)
	invite, err := s.addInvite("1", "Leader", party.ID, "2")
	if err != nil {
		s.mu.Unlock()
		t.Fatal(err)
	}
	s.cacheInvite(invite)
	if _, err = s.accept(invite.ID, "2", "Friend"); err != nil {
		s.mu.Unlock()
		t.Fatal(err)
	}
	_, err = s.addInvite("2", "Friend", party.ID, "3")
	s.mu.Unlock()
	if err != nil {
		t.Fatalf("member invite = %v", err)
	}
}

func TestPartyStoreOnlyOwnerCanKickMember(t *testing.T) {
	s := newStore()
	s.mu.Lock()
	party := s.createParty("1", "Leader", 3)
	firstInvite, err := s.addInvite("1", "Leader", party.ID, "2")
	if err != nil {
		s.mu.Unlock()
		t.Fatal(err)
	}
	s.cacheInvite(firstInvite)
	if _, err = s.accept(firstInvite.ID, "2", "Friend"); err != nil {
		s.mu.Unlock()
		t.Fatal(err)
	}
	secondInvite, err := s.addInvite("1", "Leader", party.ID, "3")
	if err != nil {
		s.mu.Unlock()
		t.Fatal(err)
	}
	s.cacheInvite(secondInvite)
	if _, err = s.accept(secondInvite.ID, "3", "Another Friend"); err != nil {
		s.mu.Unlock()
		t.Fatal(err)
	}
	if _, err = s.startBattle(party.ID, "1"); err != nil {
		s.mu.Unlock()
		t.Fatal(err)
	}
	if _, err = s.kick(party.ID, "2", "3"); err == nil {
		s.mu.Unlock()
		t.Fatal("non-owner kick should fail")
	}
	updated, err := s.kick(party.ID, "1", "2")
	s.mu.Unlock()
	if err != nil {
		t.Fatalf("owner kick = %v", err)
	}
	if updated == nil || len(updated.Members) != 2 || updated.Members[0].PlayerID != "1" || updated.Members[1].PlayerID != "3" || updated.BattleNonce != "" || updated.BattleStartedAt != 0 {
		t.Fatalf("party after owner kick = %+v", updated)
	}
}

func TestPartyHTTPAllowsMemberInvitesAndOwnerKicks(t *testing.T) {
	s := newStore()
	s.mu.Lock()
	party := s.createParty("1", "Leader", 3)
	for _, member := range []struct {
		id   string
		name string
	}{{"2", "Friend"}} {
		invite, err := s.addInvite("1", "Leader", party.ID, member.id)
		if err != nil {
			s.mu.Unlock()
			t.Fatal(err)
		}
		s.cacheInvite(invite)
		if _, err = s.accept(invite.ID, member.id, member.name); err != nil {
			s.mu.Unlock()
			t.Fatal(err)
		}
	}
	kickParty := s.createParty("10", "Another Leader", 3)
	for _, member := range []struct {
		id   string
		name string
	}{{"11", "Kick Friend"}, {"12", "Another Kick Friend"}} {
		invite, err := s.addInvite("10", "Another Leader", kickParty.ID, member.id)
		if err != nil {
			s.mu.Unlock()
			t.Fatal(err)
		}
		s.cacheInvite(invite)
		if _, err = s.accept(invite.ID, member.id, member.name); err != nil {
			s.mu.Unlock()
			t.Fatal(err)
		}
	}
	s.mu.Unlock()
	srv := &server{state: s, maxPartySize: 3, hub: newInviteHub()}
	t.Setenv("ENVIRONMENT", "development")

	inviteRequest := httptest.NewRequest(http.MethodPost, "/party/"+party.ID+"/invites", strings.NewReader(`{"playerId":"4","toName":"New Friend"}`))
	inviteRequest.Header.Set("X-User-ID", "2")
	inviteResponse := httptest.NewRecorder()
	srv.ServeHTTP(inviteResponse, inviteRequest)
	if inviteResponse.Code != http.StatusCreated {
		t.Fatalf("member invite status = %d, want %d", inviteResponse.Code, http.StatusCreated)
	}
	var invite Invite
	if err := json.NewDecoder(inviteResponse.Body).Decode(&invite); err != nil {
		t.Fatal(err)
	}
	if invite.FromName != "Friend" {
		t.Fatalf("invite fromName = %q, want party member nickname", invite.FromName)
	}

	nonOwnerKick := httptest.NewRequest(http.MethodDelete, "/party/"+kickParty.ID+"/members/12", nil)
	nonOwnerKick.Header.Set("X-User-ID", "11")
	nonOwnerKickResponse := httptest.NewRecorder()
	srv.ServeHTTP(nonOwnerKickResponse, nonOwnerKick)
	if nonOwnerKickResponse.Code != http.StatusForbidden {
		t.Fatalf("non-owner kick status = %d, want %d", nonOwnerKickResponse.Code, http.StatusForbidden)
	}

	ownerKick := httptest.NewRequest(http.MethodDelete, "/party/"+kickParty.ID+"/members/12", nil)
	ownerKick.Header.Set("X-User-ID", "10")
	ownerKickResponse := httptest.NewRecorder()
	srv.ServeHTTP(ownerKickResponse, ownerKick)
	if ownerKickResponse.Code != http.StatusOK {
		t.Fatalf("owner kick status = %d, want %d", ownerKickResponse.Code, http.StatusOK)
	}
}

func TestPartyHTTPRestoresAndLeavesActiveParty(t *testing.T) {
	s := newStore()
	srv := &server{state: s, maxPartySize: 3, hub: newInviteHub()}
	t.Setenv("ENVIRONMENT", "development")

	create := httptest.NewRequest(http.MethodPost, "/party", nil)
	create.Header.Set("X-User-ID", "1")
	created := httptest.NewRecorder()
	srv.ServeHTTP(created, create)
	if created.Code != http.StatusCreated {
		t.Fatalf("create status = %d, want %d", created.Code, http.StatusCreated)
	}
	var party Party
	if err := json.NewDecoder(created.Body).Decode(&party); err != nil {
		t.Fatal(err)
	}

	mine := httptest.NewRequest(http.MethodGet, "/party/mine", nil)
	mine.Header.Set("X-User-ID", "1")
	mineResponse := httptest.NewRecorder()
	srv.ServeHTTP(mineResponse, mine)
	if mineResponse.Code != http.StatusOK {
		t.Fatalf("mine status = %d, want %d", mineResponse.Code, http.StatusOK)
	}
	var restored Party
	if err := json.NewDecoder(mineResponse.Body).Decode(&restored); err != nil {
		t.Fatal(err)
	}
	if restored.ID != party.ID {
		t.Fatalf("restored party = %q, want %q", restored.ID, party.ID)
	}

	start := httptest.NewRequest(http.MethodPost, "/party/"+party.ID+"/start", strings.NewReader(`{"mapName":"team-battle"}`))
	start.Header.Set("Content-Type", "application/json")
	start.Header.Set("X-User-ID", "1")
	startResponse := httptest.NewRecorder()
	srv.ServeHTTP(startResponse, start)
	if startResponse.Code != http.StatusOK {
		t.Fatalf("start status = %d, want %d", startResponse.Code, http.StatusOK)
	}
	var started Party
	if err := json.NewDecoder(startResponse.Body).Decode(&started); err != nil {
		t.Fatal(err)
	}
	if started.BattleNonce == "" || started.BattleMap != "team-battle" {
		t.Fatalf("start response did not include the selected battle map: %+v", started)
	}

	leave := httptest.NewRequest(http.MethodDelete, "/party/"+party.ID+"/members/1", nil)
	leave.Header.Set("X-User-ID", "1")
	leaveResponse := httptest.NewRecorder()
	srv.ServeHTTP(leaveResponse, leave)
	if leaveResponse.Code != http.StatusOK {
		t.Fatalf("leave status = %d, want %d", leaveResponse.Code, http.StatusOK)
	}

	mineAfterLeave := httptest.NewRequest(http.MethodGet, "/party/mine", nil)
	mineAfterLeave.Header.Set("X-User-ID", "1")
	mineAfterLeaveResponse := httptest.NewRecorder()
	srv.ServeHTTP(mineAfterLeaveResponse, mineAfterLeave)
	if mineAfterLeaveResponse.Code != http.StatusOK {
		t.Fatalf("mine after leave status = %d, want %d", mineAfterLeaveResponse.Code, http.StatusOK)
	}
	var absent *Party
	if err := json.NewDecoder(mineAfterLeaveResponse.Body).Decode(&absent); err != nil {
		t.Fatal(err)
	}
	if absent != nil {
		t.Fatalf("party after last member leaves = %+v, want null", absent)
	}
}

func TestPartyHTTPDoesNotExposePartyToOutsider(t *testing.T) {
	s := newStore()
	s.mu.Lock()
	party := s.createParty("1", "Leader", 3)
	s.mu.Unlock()
	srv := &server{state: s, maxPartySize: 3, hub: newInviteHub()}
	t.Setenv("ENVIRONMENT", "development")

	request := httptest.NewRequest(http.MethodGet, "/party/"+party.ID, nil)
	request.Header.Set("X-User-ID", "2")
	response := httptest.NewRecorder()
	srv.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("outsider party read status = %d, body=%s; want 404", response.Code, response.Body.String())
	}
}

func TestPartyHTTPRejectsEmptyInviteTarget(t *testing.T) {
	s := newStore()
	s.mu.Lock()
	party := s.createParty("1", "Leader", 3)
	s.mu.Unlock()
	srv := &server{state: s, maxPartySize: 3, hub: newInviteHub()}
	t.Setenv("ENVIRONMENT", "development")

	request := httptest.NewRequest(http.MethodPost, "/party/"+party.ID+"/invites", strings.NewReader(`{}`))
	request.Header.Set("X-User-ID", "1")
	response := httptest.NewRecorder()
	srv.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("empty invite target status = %d, body=%s; want 400", response.Code, response.Body.String())
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	if len(s.invitations) != 0 {
		t.Fatalf("empty invite target created invitations = %+v", s.invitations)
	}
}

func TestPartyHTTPRejectsMalformedInviteJSON(t *testing.T) {
	s := newStore()
	s.mu.Lock()
	party := s.createParty("1", "Leader", 3)
	s.mu.Unlock()
	srv := &server{state: s, maxPartySize: 3, hub: newInviteHub()}
	t.Setenv("ENVIRONMENT", "development")

	request := httptest.NewRequest(http.MethodPost, "/party/"+party.ID+"/invites", strings.NewReader(`{"playerId":`))
	request.Header.Set("X-User-ID", "1")
	response := httptest.NewRecorder()
	srv.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("malformed invite JSON status = %d, body=%s; want 400", response.Code, response.Body.String())
	}
}

func TestCacheInviteDoesNotRevertTerminalStatus(t *testing.T) {
	s := newStore()
	now := time.Now().UnixMilli()
	s.mu.Lock()
	s.cacheInvite(&Invite{ID: "invite-1", PartyID: "party-1", FromID: "1", ToID: "2", Status: "pending", CreatedAt: now, ExpiresAt: now + 60_000})
	s.cacheInvite(&Invite{ID: "invite-1", PartyID: "party-1", FromID: "1", ToID: "2", Status: "declined", CreatedAt: now, ExpiresAt: now + 60_000, RespondedAt: now + 1})
	accepted := s.cacheInvite(&Invite{ID: "invite-1", PartyID: "party-1", FromID: "1", ToID: "2", Status: "pending", CreatedAt: now, ExpiresAt: now + 60_000})
	stored := *s.invitations["invite-1"]
	s.mu.Unlock()

	if accepted {
		t.Fatal("stale pending invite was accepted after decline")
	}
	if stored.Status != "declined" || stored.RespondedAt != now+1 {
		t.Fatalf("stored invite = %+v, want declined terminal status", stored)
	}
}

func TestPartyStoreSharesOneBattleStartAcrossMembers(t *testing.T) {
	s := newStore()
	s.mu.Lock()
	party := s.createParty("1", "Leader", 3)
	invite, err := s.addInvite("1", "Leader", party.ID, "2")
	if err != nil {
		s.mu.Unlock()
		t.Fatal(err)
	}
	s.cacheInvite(invite)
	if _, err = s.accept(invite.ID, "2", "Friend"); err != nil {
		s.mu.Unlock()
		t.Fatal(err)
	}
	first, err := s.startBattle(party.ID, "1")
	if err != nil {
		s.mu.Unlock()
		t.Fatal(err)
	}
	second, err := s.startBattle(party.ID, "2")
	s.mu.Unlock()
	if err != nil {
		t.Fatal(err)
	}
	if first.BattleNonce == "" || first.BattleStartedAt == 0 || second.BattleNonce != first.BattleNonce {
		t.Fatalf("battle start = first %+v, second %+v; want one shared nonce", first, second)
	}
}

func TestPartyStoreClearsPendingBattleWhenOwnerLeaves(t *testing.T) {
	s := newStore()
	s.mu.Lock()
	party := s.createParty("1", "Leader", 3)
	for _, member := range []struct {
		id   string
		name string
	}{{"2", "Friend"}, {"3", "Another Friend"}} {
		invite, err := s.addInvite("1", "Leader", party.ID, member.id)
		if err != nil {
			s.mu.Unlock()
			t.Fatal(err)
		}
		s.cacheInvite(invite)
		if _, err = s.accept(invite.ID, member.id, member.name); err != nil {
			s.mu.Unlock()
			t.Fatal(err)
		}
	}
	if _, err := s.startBattle(party.ID, "1"); err != nil {
		s.mu.Unlock()
		t.Fatal(err)
	}
	updated, err := s.leave(party.ID, "1")
	s.mu.Unlock()
	if err != nil {
		t.Fatal(err)
	}
	if updated == nil || updated.BattleNonce != "" || updated.BattleStartedAt != 0 {
		t.Fatalf("party after owner leaves = %+v, want pending battle cleared", updated)
	}
}
