package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/segmentio/kafka-go"
)

const maxDefaultPartySize = 3
const inviteTopic = "party-invites"
const inviteTTL = 5 * time.Minute

type Member struct {
	PlayerID string `json:"playerId"`
	Name     string `json:"name"`
	Hero     string `json:"hero"`
	Owner    bool   `json:"owner"`
	Ready    bool   `json:"ready"`
}

type Party struct {
	ID        string   `json:"partyId"`
	OwnerID   string   `json:"ownerId"`
	MaxSize   int      `json:"maxSize"`
	Members   []Member `json:"members"`
	CreatedAt int64    `json:"createdAt"`
}

type Invite struct {
	ID        string `json:"inviteId"`
	PartyID   string `json:"partyId"`
	FromID    string `json:"fromId"`
	FromName  string `json:"fromName"`
	ToID      string `json:"toId"`
	Status    string `json:"status"`
	CreatedAt int64  `json:"createdAt"`
	ExpiresAt int64  `json:"expiresAt"`
}

type inviteEvent struct {
	Invite *Invite `json:"invite"`
}

type RecentTeammate struct {
	PlayerID     string `json:"playerId"`
	Name         string `json:"name"`
	LastPlayedAt int64  `json:"lastPlayedAt"`
	Games        int    `json:"games"`
	Wins         int    `json:"wins"`
}

type PartyMatch struct {
	RoomID  string        `json:"roomId"`
	PartyID string        `json:"partyId"`
	EndedAt int64         `json:"endedAt"`
	Winner  string        `json:"winner"`
	Members []MatchMember `json:"members"`
}

type MatchMember struct {
	PlayerID string `json:"playerId"`
	Name     string `json:"name"`
	Team     string `json:"team"`
	Won      bool   `json:"won"`
}

type battleResult struct {
	RoomID  string `json:"roomId"`
	EndedAt int64  `json:"endedAt"`
	Mode    string `json:"mode"`
	Winner  string `json:"winner"`
	Players []struct {
		PlayerID string `json:"playerId"`
		Name     string `json:"name"`
		PartyID  string `json:"partyId"`
		Team     string `json:"team"`
		Won      bool   `json:"won"`
	} `json:"players"`
}

type store struct {
	mu          sync.RWMutex
	parties     map[string]*Party
	invitations map[string]*Invite
	recent      map[string]map[string]*RecentTeammate
	history     map[string][]PartyMatch
	sequence    uint64
	path        string
}

func newStore() *store {
	return &store{parties: map[string]*Party{}, invitations: map[string]*Invite{}, recent: map[string]map[string]*RecentTeammate{}, history: map[string][]PartyMatch{}}
}

type storeSnapshot struct {
	Parties     map[string]*Party                     `json:"parties"`
	Invitations map[string]*Invite                    `json:"invitations"`
	Recent      map[string]map[string]*RecentTeammate `json:"recent"`
	History     map[string][]PartyMatch               `json:"history"`
	Sequence    uint64                                `json:"sequence"`
}

func loadStore(path string) *store {
	state := newStore()
	state.path = strings.TrimSpace(path)
	if state.path == "" {
		return state
	}
	data, err := os.ReadFile(state.path)
	if err != nil {
		return state
	}
	var snapshot storeSnapshot
	if json.Unmarshal(data, &snapshot) != nil {
		return state
	}
	if snapshot.Parties != nil {
		state.parties = snapshot.Parties
	}
	if snapshot.Invitations != nil {
		state.invitations = snapshot.Invitations
	}
	if snapshot.Recent != nil {
		state.recent = snapshot.Recent
	}
	if snapshot.History != nil {
		state.history = snapshot.History
	}
	state.sequence = snapshot.Sequence
	return state
}

func (s *store) persistLocked() {
	if s == nil || s.path == "" {
		return
	}
	data, err := json.Marshal(storeSnapshot{Parties: s.parties, Invitations: s.invitations, Recent: s.recent, History: s.history, Sequence: s.sequence})
	if err != nil {
		log.Printf("party store marshal error: %v", err)
		return
	}
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		log.Printf("party store directory error: %v", err)
		return
	}
	temporary, err := os.CreateTemp(filepath.Dir(s.path), ".party-store-*")
	if err != nil {
		log.Printf("party store temp file error: %v", err)
		return
	}
	temporaryName := temporary.Name()
	defer os.Remove(temporaryName)
	if _, err = temporary.Write(data); err == nil {
		err = temporary.Close()
	} else {
		_ = temporary.Close()
	}
	if err != nil {
		log.Printf("party store write error: %v", err)
		return
	}
	if err := os.Rename(temporaryName, s.path); err != nil {
		log.Printf("party store replace error: %v", err)
	}
}

func (s *store) next(prefix string) string {
	s.sequence++
	return prefix + "-" + strconv.FormatInt(time.Now().UnixNano(), 36) + "-" + strconv.FormatUint(s.sequence, 36)
}

func (s *store) createParty(ownerID, ownerName string, maxSize int) *Party {
	if maxSize < 2 {
		maxSize = 2
	}
	if maxSize > 9 {
		maxSize = 9
	}
	p := &Party{ID: s.next("party"), OwnerID: ownerID, MaxSize: maxSize, CreatedAt: time.Now().UnixMilli(), Members: []Member{{PlayerID: ownerID, Name: ownerName, Owner: true}}}
	s.parties[p.ID] = p
	s.persistLocked()
	return cloneParty(p)
}

func cloneParty(p *Party) *Party {
	copy := *p
	copy.Members = append([]Member(nil), p.Members...)
	return &copy
}

func (s *store) addInvite(fromID, fromName, partyID, toID string) (*Invite, error) {
	p, ok := s.parties[partyID]
	if !ok {
		return nil, errors.New("party not found")
	}
	if p.OwnerID != fromID {
		return nil, errors.New("only party owner can invite")
	}
	if len(p.Members) >= p.MaxSize {
		return nil, errors.New("party is full")
	}
	if fromID == toID {
		return nil, errors.New("cannot invite yourself")
	}
	i := &Invite{ID: s.next("invite"), PartyID: partyID, FromID: fromID, FromName: fromName, ToID: toID, Status: "pending", CreatedAt: time.Now().UnixMilli()}
	return i, nil
}

func (s *store) pending(toID string) []*Invite {
	result := []*Invite{}
	now := time.Now().UnixMilli()
	for _, invite := range s.invitations {
		if invite.ExpiresAt > 0 && invite.ExpiresAt <= now {
			continue
		}
		if invite.ToID == toID && invite.Status == "pending" {
			copy := *invite
			result = append(result, &copy)
		}
	}
	return result
}

func (s *store) cacheInvite(invite *Invite) {
	if invite == nil {
		return
	}
	if invite.ExpiresAt == 0 {
		invite.ExpiresAt = time.Now().Add(inviteTTL).UnixMilli()
	}
	s.invitations[invite.ID] = invite
	s.persistLocked()
}

func (s *store) accept(id, userID string, displayName ...string) (*Party, error) {
	i, ok := s.invitations[id]
	if !ok || i.ToID != userID || i.Status != "pending" {
		return nil, errors.New("invite is not available")
	}
	p, ok := s.parties[i.PartyID]
	if !ok || len(p.Members) >= p.MaxSize {
		return nil, errors.New("party is full or expired")
	}
	for _, member := range p.Members {
		if member.PlayerID == userID {
			return nil, errors.New("already in party")
		}
	}
	name := userID
	if len(displayName) > 0 && strings.TrimSpace(displayName[0]) != "" {
		name = strings.TrimSpace(displayName[0])
	}
	p.Members = append(p.Members, Member{PlayerID: userID, Name: name})
	i.Status = "accepted"
	s.persistLocked()
	return cloneParty(p), nil
}

func (s *store) decline(id, userID string) error {
	i, ok := s.invitations[id]
	if !ok || i.ToID != userID || i.Status != "pending" {
		return errors.New("invite is not available")
	}
	i.Status = "declined"
	s.persistLocked()
	return nil
}

func (s *store) setHero(partyID, playerID, hero string) (*Party, error) {
	p, ok := s.parties[partyID]
	if !ok {
		return nil, errors.New("party not found")
	}
	for index := range p.Members {
		if p.Members[index].PlayerID == playerID {
			p.Members[index].Hero = strings.TrimSpace(hero)
			s.persistLocked()
			return cloneParty(p), nil
		}
	}
	return nil, errors.New("player is not in party")
}

func (s *store) recentFor(userID string, limit int) []*RecentTeammate {
	items := []*RecentTeammate{}
	for _, item := range s.recent[userID] {
		copy := *item
		items = append(items, &copy)
	}
	for i := 0; i < len(items); i++ {
		for j := i + 1; j < len(items); j++ {
			if items[j].LastPlayedAt > items[i].LastPlayedAt {
				items[i], items[j] = items[j], items[i]
			}
		}
	}
	if limit > len(items) {
		limit = len(items)
	}
	return items[:limit]
}

func (s *store) historyFor(userID string, limit int) []PartyMatch {
	items := append([]PartyMatch(nil), s.history[userID]...)
	if limit > len(items) {
		limit = len(items)
	}
	return items[:limit]
}

func (s *store) recordResult(result battleResult) {
	byParty := map[string][]struct {
		id, name string
		team     string
		won      bool
	}{}
	for _, p := range result.Players {
		if p.PartyID != "" {
			byParty[p.PartyID] = append(byParty[p.PartyID], struct {
				id, name string
				team     string
				won      bool
			}{p.PlayerID, p.Name, p.Team, p.Won})
		}
	}
	for partyID, players := range byParty {
		if len(players) < 2 {
			continue
		}
		members := make([]MatchMember, 0, len(players))
		for _, p := range players {
			members = append(members, MatchMember{PlayerID: p.id, Name: p.name, Team: p.team, Won: p.won})
		}
		match := PartyMatch{RoomID: result.RoomID, PartyID: partyID, EndedAt: result.EndedAt, Winner: result.Winner, Members: members}
		for _, p := range players {
			s.history[p.id] = append([]PartyMatch{match}, s.history[p.id]...)
			if s.recent[p.id] == nil {
				s.recent[p.id] = map[string]*RecentTeammate{}
			}
			for _, teammate := range players {
				if teammate.id == p.id {
					continue
				}
				item := s.recent[p.id][teammate.id]
				if item == nil {
					item = &RecentTeammate{PlayerID: teammate.id, Name: teammate.name}
					s.recent[p.id][teammate.id] = item
				}
				item.Name = teammate.name
				item.Games++
				if teammate.won {
					item.Wins++
				}
				item.LastPlayedAt = result.EndedAt
			}
		}
	}
	s.persistLocked()
}

type server struct {
	state        *store
	maxPartySize int
	hub          *inviteHub
	inviteWriter *kafka.Writer
	accountURL   string
}

type inviteHub struct {
	mu      sync.Mutex
	clients map[string]map[*websocket.Conn]struct{}
}

func newInviteHub() *inviteHub { return &inviteHub{clients: map[string]map[*websocket.Conn]struct{}{}} }
func (h *inviteHub) add(userID string, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.clients[userID] == nil {
		h.clients[userID] = map[*websocket.Conn]struct{}{}
	}
	h.clients[userID][conn] = struct{}{}
}
func (h *inviteHub) remove(userID string, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.clients[userID], conn)
	if len(h.clients[userID]) == 0 {
		delete(h.clients, userID)
	}
}
func (h *inviteHub) notify(userID string, invite *Invite) {
	h.mu.Lock()
	defer h.mu.Unlock()
	payload := map[string]any{"type": "party_invite", "invite": invite}
	for conn := range h.clients[userID] {
		if err := conn.WriteJSON(payload); err != nil {
			delete(h.clients[userID], conn)
			_ = conn.Close()
		}
	}
}

var wsUpgrader = websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}

func userID(r *http.Request) string {
	if os.Getenv("ENVIRONMENT") != "production" {
		if id := strings.TrimSpace(r.Header.Get("X-User-ID")); id != "" {
			return id
		}
	}
	auth := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	parts := strings.Split(auth, ".")
	if len(parts) == 2 && verifyJWT(parts, os.Getenv("APP_AUTH_SECRET")) {
		if payload, err := base64.RawURLEncoding.DecodeString(parts[0]); err == nil {
			var value struct {
				Sub string `json:"sub"`
				Exp int64  `json:"exp"`
			}
			if json.Unmarshal(payload, &value) == nil {
				if value.Exp > time.Now().Unix() && value.Sub != "" {
					return value.Sub
				}
			}
		}
	}
	return ""
}

func verifyJWT(parts []string, secret string) bool {
	if secret == "" {
		return false
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(parts[0]))
	return hmac.Equal(signature, mac.Sum(nil))
}

func (s *server) requireUser(w http.ResponseWriter, r *http.Request) string {
	id := userID(r)
	if id == "" {
		http.Error(w, `{"detail":"authentication required"}`, http.StatusUnauthorized)
	}
	return id
}

func (s *server) handleInviteWebSocket(w http.ResponseWriter, r *http.Request) {
	request := r
	if token := r.URL.Query().Get("token"); token != "" {
		request = r.Clone(r.Context())
		request.Header.Set("Authorization", "Bearer "+token)
	}
	id := userID(request)
	if id == "" && os.Getenv("ENVIRONMENT") != "production" {
		id = strings.TrimSpace(r.URL.Query().Get("userId"))
	}
	if id == "" {
		http.Error(w, "authentication required", http.StatusUnauthorized)
		return
	}
	conn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	s.hub.add(id, conn)
	defer s.hub.remove(id, conn)
	defer conn.Close()
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			return
		}
	}
}

func publishInvite(writer *kafka.Writer, invite *Invite) error {
	if writer == nil {
		return nil
	}
	value, err := json.Marshal(inviteEvent{Invite: invite})
	if err != nil {
		return err
	}
	return writer.WriteMessages(context.Background(), kafka.Message{Key: []byte(invite.ToID), Value: value})
}
func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func decode(r *http.Request, value any) error { return json.NewDecoder(r.Body).Decode(value) }

func (s *server) lookupPlayer(playerID string) (string, error) {
	playerID = strings.TrimSpace(playerID)
	if playerID == "" {
		return "", errors.New("playerId is required")
	}
	if s.accountURL == "" {
		return "", errors.New("account service is not configured")
	}
	request, err := http.NewRequest(http.MethodGet, strings.TrimRight(s.accountURL, "/")+"/users/"+url.PathEscape(playerID)+"/profile", nil)
	if err != nil {
		return "", err
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusNotFound {
		return "", fmt.Errorf("player %s not found", playerID)
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return "", fmt.Errorf("account service returned %s", response.Status)
	}
	var profile struct {
		Username string `json:"username"`
		FullName string `json:"full_name"`
	}
	if err := json.NewDecoder(response.Body).Decode(&profile); err != nil {
		return "", err
	}
	name := strings.TrimSpace(profile.FullName)
	if name == "" {
		name = strings.TrimSpace(profile.Username)
	}
	if name == "" {
		name = playerID
	}
	return name, nil
}

func (s *server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/health" {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
		return
	}
	if r.Method == "GET" && r.URL.Path == "/party/ws" {
		s.handleInviteWebSocket(w, r)
		return
	}
	if r.Method == "GET" && r.URL.Path == "/party/recent-teammates" {
		id := s.requireUser(w, r)
		if id == "" {
			return
		}
		s.state.mu.RLock()
		items := s.state.recentFor(id, 20)
		s.state.mu.RUnlock()
		writeJSON(w, http.StatusOK, items)
		return
	}
	if r.Method == "GET" && r.URL.Path == "/party/history" {
		id := s.requireUser(w, r)
		if id == "" {
			return
		}
		s.state.mu.RLock()
		items := s.state.historyFor(id, 20)
		s.state.mu.RUnlock()
		writeJSON(w, http.StatusOK, items)
		return
	}
	if r.Method == "GET" && r.URL.Path == "/party/invites/pending" {
		id := s.requireUser(w, r)
		if id == "" {
			return
		}
		s.state.mu.RLock()
		items := s.state.pending(id)
		s.state.mu.RUnlock()
		writeJSON(w, http.StatusOK, items)
		return
	}
	if r.Method == "GET" && r.URL.Path == "/party/search" {
		id := s.requireUser(w, r)
		if id == "" {
			return
		}
		target := strings.TrimSpace(r.URL.Query().Get("playerId"))
		if target == "" || target == id {
			http.Error(w, "playerId is required", http.StatusBadRequest)
			return
		}
		name, err := s.lookupPlayer(target)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"playerId": target, "name": name})
		return
	}
	if r.Method == "POST" && r.URL.Path == "/party" {
		id := s.requireUser(w, r)
		if id == "" {
			return
		}
		var req struct {
			Name    string `json:"name"`
			MaxSize int    `json:"maxSize"`
		}
		_ = decode(r, &req)
		if strings.TrimSpace(req.Name) == "" || strings.TrimSpace(req.Name) == id {
			if accountName, err := s.lookupPlayer(id); err == nil {
				req.Name = accountName
			}
		}
		if req.MaxSize == 0 {
			req.MaxSize = s.maxPartySize
		}
		if req.MaxSize > s.maxPartySize {
			req.MaxSize = s.maxPartySize
		}
		s.state.mu.Lock()
		p := s.state.createParty(id, req.Name, req.MaxSize)
		s.state.mu.Unlock()
		writeJSON(w, http.StatusCreated, p)
		return
	}
	if r.Method == "POST" && strings.HasPrefix(r.URL.Path, "/party/invites/") && strings.HasSuffix(r.URL.Path, "/accept") {
		id := s.requireUser(w, r)
		if id == "" {
			return
		}
		inviteID := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/party/invites/"), "/accept")
		name := id
		if accountName, err := s.lookupPlayer(id); err == nil {
			name = accountName
		}
		s.state.mu.Lock()
		p, err := s.state.accept(inviteID, id, name)
		s.state.mu.Unlock()
		if err != nil {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		writeJSON(w, http.StatusOK, p)
		return
	}
	if r.Method == "POST" && strings.HasPrefix(r.URL.Path, "/party/invites/") && strings.HasSuffix(r.URL.Path, "/decline") {
		id := s.requireUser(w, r)
		if id == "" {
			return
		}
		inviteID := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/party/invites/"), "/decline")
		s.state.mu.Lock()
		err := s.state.decline(inviteID, id)
		s.state.mu.Unlock()
		if err != nil {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "declined"})
		return
	}
	if r.Method == "POST" && strings.HasPrefix(r.URL.Path, "/party/") && strings.HasSuffix(r.URL.Path, "/invites") {
		id := s.requireUser(w, r)
		if id == "" {
			return
		}
		partyID := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/party/"), "/invites")
		var req struct {
			PlayerID string `json:"playerId"`
		}
		_ = decode(r, &req)
		s.state.mu.Lock()
		invite, err := s.state.addInvite(id, id, partyID, strings.TrimSpace(req.PlayerID))
		s.state.mu.Unlock()
		if err != nil {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		invite.ExpiresAt = time.Now().Add(inviteTTL).UnixMilli()
		if err := publishInvite(s.inviteWriter, invite); err != nil {
			http.Error(w, "invite delivery unavailable", http.StatusServiceUnavailable)
			return
		}
		if s.inviteWriter == nil {
			s.state.mu.Lock()
			s.state.cacheInvite(invite)
			s.state.mu.Unlock()
		}
		writeJSON(w, http.StatusCreated, invite)
		return
	}
	if r.Method == "POST" && strings.HasPrefix(r.URL.Path, "/party/") && strings.Contains(r.URL.Path, "/members/") && strings.HasSuffix(r.URL.Path, "/hero") {
		id := s.requireUser(w, r)
		if id == "" {
			return
		}
		path := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/party/"), "/hero")
		parts := strings.Split(path, "/members/")
		if len(parts) != 2 || parts[1] != id {
			http.Error(w, "only the member can change their hero", http.StatusForbidden)
			return
		}
		var req struct {
			Hero string `json:"hero"`
		}
		_ = decode(r, &req)
		s.state.mu.Lock()
		p, err := s.state.setHero(parts[0], id, req.Hero)
		s.state.mu.Unlock()
		if err != nil {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		writeJSON(w, http.StatusOK, p)
		return
	}
	if r.Method == "GET" && strings.HasPrefix(r.URL.Path, "/party/") {
		partyID := strings.TrimPrefix(r.URL.Path, "/party/")
		s.state.mu.RLock()
		p := s.state.parties[partyID]
		s.state.mu.RUnlock()
		if p == nil {
			http.NotFound(w, r)
			return
		}
		writeJSON(w, http.StatusOK, p)
		return
	}
	http.NotFound(w, r)
}

func consumeResults(state *store, addr string) {
	if addr == "" {
		return
	}
	reader := kafka.NewReader(kafka.ReaderConfig{Brokers: []string{addr}, Topic: "battle-results", GroupID: "party-service", MinBytes: 1, MaxBytes: 10e6})
	go func() {
		defer reader.Close()
		for {
			message, err := reader.ReadMessage(context.Background())
			if err != nil {
				log.Printf("party results consumer: %v", err)
				return
			}
			var result battleResult
			if json.Unmarshal(message.Value, &result) == nil {
				state.mu.Lock()
				state.recordResult(result)
				state.mu.Unlock()
			}
		}
	}()
}

func consumeInvites(state *store, hub *inviteHub, addr string) {
	if addr == "" {
		return
	}
	reader := kafka.NewReader(kafka.ReaderConfig{Brokers: []string{addr}, Topic: inviteTopic, GroupID: "party-service-invites", MinBytes: 1, MaxBytes: 1e6})
	go func() {
		defer reader.Close()
		for {
			message, err := reader.ReadMessage(context.Background())
			if err != nil {
				log.Printf("party invite consumer: %v", err)
				return
			}
			var event inviteEvent
			if json.Unmarshal(message.Value, &event) != nil || event.Invite == nil {
				continue
			}
			if event.Invite.ExpiresAt == 0 {
				event.Invite.ExpiresAt = time.Now().Add(inviteTTL).UnixMilli()
			}
			if event.Invite.ExpiresAt <= time.Now().UnixMilli() {
				continue
			}
			state.mu.Lock()
			state.cacheInvite(event.Invite)
			state.mu.Unlock()
			hub.notify(event.Invite.ToID, event.Invite)
		}
	}()
}

func main() {
	state := loadStore(os.Getenv("PARTY_STORE_PATH"))
	broker := os.Getenv("KAFKA_ADDR")
	hub := newInviteHub()
	consumeResults(state, broker)
	consumeInvites(state, hub, broker)
	port := os.Getenv("PORT")
	if port == "" {
		port = "8002"
	}
	maxPartySize := maxDefaultPartySize
	if configured, err := strconv.Atoi(os.Getenv("MAX_PARTY_SIZE")); err == nil && configured >= 2 && configured <= 9 {
		maxPartySize = configured
	}
	var inviteWriter *kafka.Writer
	if broker != "" {
		inviteWriter = kafka.NewWriter(kafka.WriterConfig{Brokers: []string{broker}, Topic: inviteTopic, Balancer: &kafka.LeastBytes{}, RequiredAcks: int(kafka.RequireOne)})
	}
	accountURL := os.Getenv("ACCOUNT_URL")
	log.Printf("party service listening on %s", port)
	log.Fatal(http.ListenAndServe(":"+port, &server{state: state, maxPartySize: maxPartySize, hub: hub, inviteWriter: inviteWriter, accountURL: accountURL}))
}
