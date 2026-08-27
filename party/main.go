package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/gorilla/websocket"
	"github.com/segmentio/kafka-go"
)

const maxDefaultPartySize = 3
const inviteTopic = "party-invites"
const inviteStatusTopic = "party-invite-status"
const inviteTTL = 5 * time.Minute
const inviteStatusDisplayTTL = 5 * time.Second
const partyBattleStartTTL = 45 * time.Second
const defaultPartyBattleMap = "team-battle-northern"
const accountRequestTimeout = 5 * time.Second
const kafkaPublishTimeout = 5 * time.Second
const maxJSONBodyBytes = 1 << 20

type Member struct {
	PlayerID string `json:"playerId"`
	Name     string `json:"name"`
	Hero     string `json:"hero"`
	Owner    bool   `json:"owner"`
	Ready    bool   `json:"ready"`
}

type Party struct {
	ID              string   `json:"partyId"`
	OwnerID         string   `json:"ownerId"`
	MaxSize         int      `json:"maxSize"`
	Members         []Member `json:"members"`
	CreatedAt       int64    `json:"createdAt"`
	Revision        uint64   `json:"revision"`
	BattleNonce     string   `json:"battleNonce,omitempty"`
	BattleStartedAt int64    `json:"battleStartedAt,omitempty"`
	BattleTicket    string   `json:"battleTicket,omitempty"`
	BattleMap       string   `json:"battleMap,omitempty"`
}

type battleTicketClaims struct {
	PartyID  string `json:"partyId"`
	PlayerID string `json:"playerId"`
	Nonce    string `json:"nonce"`
	MaxSize  int    `json:"maxSize"`
	Exp      int64  `json:"exp"`
}

type Invite struct {
	ID            string `json:"inviteId"`
	PartyID       string `json:"partyId"`
	FromID        string `json:"fromId"`
	FromName      string `json:"fromName"`
	ToID          string `json:"toId"`
	ToName        string `json:"toName,omitempty"`
	Status        string `json:"status"`
	InvalidReason string `json:"invalidReason,omitempty"`
	CreatedAt     int64  `json:"createdAt"`
	ExpiresAt     int64  `json:"expiresAt"`
	RespondedAt   int64  `json:"respondedAt,omitempty"`
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

type PlayerSearchResult struct {
	PlayerID string `json:"playerId"`
	Name     string `json:"name"`
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
		for _, invite := range state.invitations {
			if invite.Status == "canceled" {
				invite.Status = "invalid"
				invite.InvalidReason = "canceled"
			}
		}
	}
	if snapshot.Recent != nil {
		state.recent = snapshot.Recent
	}
	if snapshot.History != nil {
		state.history = snapshot.History
	}
	state.sequence = snapshot.Sequence
	state.repairMemberships()
	return state
}

func (s *store) repairMemberships() {
	partyIDs := make([]string, 0, len(s.parties))
	for partyID := range s.parties {
		partyIDs = append(partyIDs, partyID)
	}
	sort.Strings(partyIDs)
	seenPlayers := map[string]string{}
	changed := false
	for _, partyID := range partyIDs {
		party := s.parties[partyID]
		if party == nil {
			delete(s.parties, partyID)
			changed = true
			continue
		}
		members := make([]Member, 0, len(party.Members))
		for _, member := range party.Members {
			if strings.TrimSpace(member.PlayerID) == "" {
				changed = true
				continue
			}
			if _, exists := seenPlayers[member.PlayerID]; exists {
				changed = true
				continue
			}
			seenPlayers[member.PlayerID] = partyID
			members = append(members, member)
		}
		if len(members) == 0 {
			delete(s.parties, partyID)
			s.invalidatePartyInvitesNoPersistLocked(partyID, "party_disbanded")
			changed = true
			continue
		}
		party.Members = members
		if !partyHasMember(party, party.OwnerID) {
			party.OwnerID = members[0].PlayerID
			changed = true
		}
		for index := range party.Members {
			owner := party.Members[index].PlayerID == party.OwnerID
			if party.Members[index].Owner != owner {
				party.Members[index].Owner = owner
				changed = true
			}
		}
	}
	if changed {
		s.persistLocked()
	}
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

func (s *store) touchParty(p *Party) {
	if p == nil {
		return
	}
	s.sequence++
	p.Revision = s.sequence
}

func (s *store) createParty(ownerID, ownerName string, maxSize int) *Party {
	if existing := s.partyFor(ownerID); existing != nil {
		return existing
	}
	if maxSize < 2 {
		maxSize = 2
	}
	if maxSize > 9 {
		maxSize = 9
	}
	p := &Party{ID: s.next("party"), OwnerID: ownerID, MaxSize: maxSize, Revision: s.sequence, CreatedAt: time.Now().UnixMilli(), Members: []Member{{PlayerID: ownerID, Name: ownerName, Owner: true}}}
	s.parties[p.ID] = p
	s.persistLocked()
	return cloneParty(p)
}

func (s *store) partyFor(userID string) *Party {
	partyIDs := make([]string, 0, len(s.parties))
	for partyID := range s.parties {
		partyIDs = append(partyIDs, partyID)
	}
	sort.Strings(partyIDs)
	for _, partyID := range partyIDs {
		party := s.parties[partyID]
		for _, member := range party.Members {
			if member.PlayerID == userID {
				return partyViewFor(party, userID)
			}
		}
	}
	return nil
}

func partyView(p *Party) *Party {
	return partyViewFor(p, "")
}

func partyViewFor(p *Party, playerID string) *Party {
	if p == nil {
		return nil
	}
	view := cloneParty(p)
	if view.BattleStartedAt == 0 || time.Since(time.UnixMilli(view.BattleStartedAt)) > partyBattleStartTTL {
		view.BattleNonce = ""
		view.BattleStartedAt = 0
		view.BattleMap = ""
		return view
	}
	if playerID != "" && partyHasMember(view, playerID) {
		view.BattleTicket = issueBattleTicket(view, playerID)
	}
	return view
}

func issueBattleTicket(p *Party, playerID string) string {
	if p == nil || p.ID == "" || p.BattleNonce == "" || playerID == "" {
		return ""
	}
	secret := os.Getenv("APP_AUTH_SECRET")
	if secret == "" && !isProductionEnvironment() {
		secret = "local-development-auth-secret-change-before-production"
	}
	if len(secret) < 32 {
		return ""
	}
	claims := battleTicketClaims{
		PartyID:  p.ID,
		PlayerID: playerID,
		Nonce:    p.BattleNonce,
		MaxSize:  p.MaxSize,
		Exp:      time.UnixMilli(p.BattleStartedAt).Add(partyBattleStartTTL).Unix(),
	}
	payload, err := json.Marshal(claims)
	if err != nil {
		return ""
	}
	encodedPayload := base64.RawURLEncoding.EncodeToString(payload)
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(encodedPayload))
	return encodedPayload + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func isProductionEnvironment() bool {
	return strings.EqualFold(strings.TrimSpace(os.Getenv("ENVIRONMENT")), "production") || strings.EqualFold(strings.TrimSpace(os.Getenv("APP_ENV")), "production")
}

func decodeBattleTicket(token string) (battleTicketClaims, error) {
	var claims battleTicketClaims
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return claims, errors.New("invalid battle ticket")
	}
	secret := os.Getenv("APP_AUTH_SECRET")
	if secret == "" && !isProductionEnvironment() {
		secret = "local-development-auth-secret-change-before-production"
	}
	if len(secret) < 32 {
		return claims, errors.New("battle ticket secret is not configured")
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return claims, errors.New("invalid battle ticket signature")
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(parts[0]))
	if !hmac.Equal(signature, mac.Sum(nil)) {
		return claims, errors.New("invalid battle ticket signature")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil || json.Unmarshal(payload, &claims) != nil {
		return claims, errors.New("invalid battle ticket payload")
	}
	if strings.TrimSpace(claims.PartyID) == "" || strings.TrimSpace(claims.PlayerID) == "" || strings.TrimSpace(claims.Nonce) == "" || claims.Exp <= time.Now().Unix() {
		return battleTicketClaims{}, errors.New("expired or incomplete battle ticket")
	}
	return claims, nil
}

func cloneParty(p *Party) *Party {
	copy := *p
	copy.Members = append([]Member(nil), p.Members...)
	return &copy
}

func (s *store) addInvite(fromID, fromName, partyID, toID string) (*Invite, error) {
	return s.addInviteWithName(fromID, fromName, partyID, toID, "")
}

func (s *store) hasActiveInviteForLocked(toID string) bool {
	now := time.Now().UnixMilli()
	for _, invite := range s.invitations {
		if invite.ToID != toID || invite.Status != "pending" {
			continue
		}
		if invite.ExpiresAt > 0 && invite.ExpiresAt <= now {
			continue
		}
		if _, partyExists := s.parties[invite.PartyID]; !partyExists {
			continue
		}
		return true
	}
	return false
}

func (s *store) addInviteWithName(fromID, fromName, partyID, toID, toName string) (*Invite, error) {
	fromID = strings.TrimSpace(fromID)
	toID = strings.TrimSpace(toID)
	if !validPlayerID(fromID) || !validPlayerID(toID) {
		return nil, errors.New("playerId is required")
	}
	p, ok := s.parties[partyID]
	if !ok {
		return nil, errors.New("party not found")
	}
	isMember := false
	for _, member := range p.Members {
		if member.PlayerID == fromID {
			isMember = true
			break
		}
	}
	if !isMember {
		return nil, errors.New("only party members can invite")
	}
	if len(p.Members) >= p.MaxSize {
		return nil, errors.New("party is full")
	}
	if strings.TrimSpace(fromName) == "" || strings.TrimSpace(fromName) == fromID {
		for _, member := range p.Members {
			if member.PlayerID == fromID && strings.TrimSpace(member.Name) != "" {
				fromName = member.Name
				break
			}
		}
	}
	if fromID == toID {
		return nil, errors.New("cannot invite yourself")
	}
	if s.hasActiveInviteForLocked(toID) {
		return nil, errors.New("player already has an active invite")
	}
	createdAt := time.Now().UnixMilli()
	i := &Invite{ID: s.next("invite"), PartyID: partyID, FromID: fromID, FromName: strings.TrimSpace(fromName), ToID: toID, ToName: limitText(toName, 128), Status: "pending", CreatedAt: createdAt, ExpiresAt: createdAt + int64(inviteTTL/time.Millisecond)}
	return i, nil
}

func validPlayerID(value string) bool {
	value = strings.TrimSpace(value)
	return value != "" && utf8.RuneCountInString(value) <= 128 && !strings.ContainsAny(value, "\r\n\x00")
}

func limitText(value string, maxRunes int) string {
	value = strings.TrimSpace(value)
	runes := []rune(value)
	if len(runes) > maxRunes {
		runes = runes[:maxRunes]
	}
	return string(runes)
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

func (s *store) outgoing(fromID string) []*Invite {
	result := []*Invite{}
	now := time.Now().UnixMilli()
	for _, invite := range s.invitations {
		if invite.FromID != fromID {
			continue
		}
		if invite.Status == "pending" {
			if invite.ExpiresAt > 0 && invite.ExpiresAt <= now {
				continue
			}
		} else if invite.Status == "invalid" {
			// Invalid invitations are retained as history so a page refresh does
			// not make the invitation silently disappear.
		} else if invite.Status == "declined" {
			if invite.RespondedAt == 0 || now-invite.RespondedAt > int64(inviteStatusDisplayTTL/time.Millisecond) {
				continue
			}
		} else {
			continue
		}
		copy := *invite
		result = append(result, &copy)
	}
	sort.SliceStable(result, func(i, j int) bool {
		if result[i].Status == result[j].Status {
			return result[i].CreatedAt < result[j].CreatedAt
		}
		return result[i].Status == "pending"
	})
	return result
}

func (s *store) inbox(toID string) []*Invite {
	result := []*Invite{}
	now := time.Now().UnixMilli()
	for _, invite := range s.invitations {
		if invite.ToID != toID {
			continue
		}
		if invite.Status == "pending" {
			if invite.ExpiresAt > 0 && invite.ExpiresAt <= now {
				continue
			}
		} else if invite.Status == "invalid" {
			// Keep invalid invitations visible in the party screen.
		} else {
			continue
		}
		copy := *invite
		result = append(result, &copy)
	}
	return result
}

func (s *store) cacheInvite(invite *Invite) bool {
	if invite == nil {
		return false
	}
	existing := s.invitations[invite.ID]
	if invite.Status == "canceled" {
		invite.Status = "invalid"
		invite.InvalidReason = "canceled"
	}
	if existing != nil {
		incomingResponseAt := invite.RespondedAt
		existingResponseAt := existing.RespondedAt
		if existing.Status != "pending" && invite.Status == "pending" {
			return false
		}
		if existing.Status != "pending" && invite.Status != "pending" {
			if incomingResponseAt < existingResponseAt || (incomingResponseAt == existingResponseAt && invite.Status != existing.Status) {
				return false
			}
			if incomingResponseAt == existingResponseAt && invite.Status == existing.Status {
				return false
			}
		}
		if existing.Status == "pending" && invite.Status == "pending" && invite.CreatedAt < existing.CreatedAt {
			return false
		}
	}
	if invite.ExpiresAt == 0 {
		invite.ExpiresAt = time.Now().Add(inviteTTL).UnixMilli()
	}
	s.invitations[invite.ID] = invite
	s.persistLocked()
	return true
}

func (s *store) invalidateExpiredLocked(now int64) []*Invite {
	invalidated := []*Invite{}
	for _, invite := range s.invitations {
		if invite.Status != "pending" || invite.ExpiresAt == 0 || invite.ExpiresAt > now {
			continue
		}
		invite.Status = "invalid"
		invite.InvalidReason = "expired"
		invite.RespondedAt = now
		copy := *invite
		invalidated = append(invalidated, &copy)
	}
	if len(invalidated) > 0 {
		s.persistLocked()
	}
	return invalidated
}

func (s *store) invalidateOrphanedPartyInvitesLocked() []*Invite {
	invalidated := []*Invite{}
	now := time.Now().UnixMilli()
	for _, invite := range s.invitations {
		if invite.Status != "pending" {
			continue
		}
		if _, partyExists := s.parties[invite.PartyID]; partyExists {
			continue
		}
		invite.Status = "invalid"
		invite.InvalidReason = "party_disbanded"
		invite.RespondedAt = now
		copy := *invite
		invalidated = append(invalidated, &copy)
	}
	if len(invalidated) > 0 {
		s.persistLocked()
	}
	return invalidated
}

func (s *store) disbandSoloPartyAfterInviteLocked(partyID string) []string {
	removed, _ := s.disbandSoloPartyWithInvitesLocked(partyID)
	return removed
}

func (s *store) disbandSoloPartyWithInvitesLocked(partyID string) ([]string, []*Invite) {
	party, ok := s.parties[partyID]
	if !ok || len(party.Members) != 1 {
		return nil, nil
	}
	now := time.Now().UnixMilli()
	for _, invite := range s.invitations {
		if invite.PartyID != partyID || invite.Status != "pending" {
			continue
		}
		if invite.ExpiresAt == 0 || invite.ExpiresAt > now {
			return nil, nil
		}
	}
	memberID := party.Members[0].PlayerID
	invalidated := s.invalidatePartyInvitesLocked(partyID, "party_disbanded")
	delete(s.parties, partyID)
	s.persistLocked()
	return []string{memberID}, invalidated
}

func (s *store) invalidatePartyInvitesLocked(partyID, reason string) []*Invite {
	invalidated := s.invalidatePartyInvitesNoPersistLocked(partyID, reason)
	if len(invalidated) > 0 {
		s.persistLocked()
	}
	return invalidated
}

func (s *store) invalidatePartyInvitesNoPersistLocked(partyID, reason string) []*Invite {
	invalidated := []*Invite{}
	now := time.Now().UnixMilli()
	for _, invite := range s.invitations {
		if invite.PartyID != partyID || invite.Status != "pending" {
			continue
		}
		invite.Status = "invalid"
		invite.InvalidReason = reason
		invite.RespondedAt = now
		copy := *invite
		invalidated = append(invalidated, &copy)
	}
	return invalidated
}

type partyTransition struct {
	updated        []*Party
	removed        []string
	inviteStatuses []*Invite
}

func (s *store) accept(id, userID string, displayName ...string) (*Party, error) {
	party, _, err := s.acceptWithTransition(id, userID, displayName...)
	return party, err
}

func (s *store) acceptWithTransition(id, userID string, displayName ...string) (*Party, *partyTransition, error) {
	i, ok := s.invitations[id]
	if !ok || i.ToID != userID || i.Status != "pending" {
		return nil, nil, errors.New("invite is not available")
	}
	if i.ExpiresAt > 0 && i.ExpiresAt <= time.Now().UnixMilli() {
		i.Status = "invalid"
		i.InvalidReason = "expired"
		i.RespondedAt = time.Now().UnixMilli()
		s.persistLocked()
		return nil, nil, errors.New("invite is invalid")
	}
	p, ok := s.parties[i.PartyID]
	if !ok {
		i.Status = "invalid"
		i.InvalidReason = "party_disbanded"
		i.RespondedAt = time.Now().UnixMilli()
		s.persistLocked()
		return nil, nil, errors.New("invite is invalid")
	}
	if len(p.Members) >= p.MaxSize {
		return nil, nil, errors.New("party is full or expired")
	}
	for _, member := range p.Members {
		if member.PlayerID == userID {
			return nil, nil, errors.New("already in party")
		}
	}
	transition := &partyTransition{}
	partyIDs := make([]string, 0, len(s.parties))
	for partyID := range s.parties {
		if partyID != p.ID {
			partyIDs = append(partyIDs, partyID)
		}
	}
	sort.Strings(partyIDs)
	for _, partyID := range partyIDs {
		source := s.parties[partyID]
		members := make([]Member, 0, len(source.Members))
		removedFromSource := false
		for _, member := range source.Members {
			if member.PlayerID == userID {
				removedFromSource = true
				continue
			}
			members = append(members, member)
		}
		if !removedFromSource {
			continue
		}
		source.Members = members
		if len(source.Members) == 0 {
			transition.inviteStatuses = append(transition.inviteStatuses, s.invalidatePartyInvitesLocked(source.ID, "party_disbanded")...)
			delete(s.parties, source.ID)
			continue
		}
		if source.OwnerID == userID || !partyHasMember(source, source.OwnerID) {
			source.OwnerID = source.Members[0].PlayerID
		}
		for index := range source.Members {
			source.Members[index].Owner = source.Members[index].PlayerID == source.OwnerID
		}
		if len(source.Members) == 1 {
			removed, invalidated := s.disbandSoloPartyWithInvitesLocked(source.ID)
			transition.removed = append(transition.removed, removed...)
			transition.inviteStatuses = append(transition.inviteStatuses, invalidated...)
			if _, stillExists := s.parties[source.ID]; !stillExists {
				continue
			}
		}
		s.touchParty(source)
		transition.updated = append(transition.updated, cloneParty(source))
	}
	name := userID
	if len(displayName) > 0 && strings.TrimSpace(displayName[0]) != "" {
		name = strings.TrimSpace(displayName[0])
	}
	p.Members = append(p.Members, Member{PlayerID: userID, Name: name})
	i.Status = "accepted"
	i.RespondedAt = time.Now().UnixMilli()
	s.touchParty(p)
	s.persistLocked()
	accepted := *i
	transition.inviteStatuses = append(transition.inviteStatuses, &accepted)
	return cloneParty(p), transition, nil
}

func partyHasMember(party *Party, playerID string) bool {
	if party == nil || strings.TrimSpace(playerID) == "" {
		return false
	}
	for _, member := range party.Members {
		if member.PlayerID == playerID {
			return true
		}
	}
	return false
}

func (s *store) decline(id, userID string) error {
	i, ok := s.invitations[id]
	if !ok || i.ToID != userID || i.Status != "pending" {
		return errors.New("invite is not available")
	}
	i.Status = "declined"
	i.RespondedAt = time.Now().UnixMilli()
	s.persistLocked()
	return nil
}

func (s *store) cancel(id, userID string) (*Invite, error) {
	i, ok := s.invitations[id]
	if !ok || i.FromID != userID || i.Status != "pending" {
		return nil, errors.New("invite is not available")
	}
	if i.ExpiresAt > 0 && i.ExpiresAt <= time.Now().UnixMilli() {
		return nil, errors.New("invite is expired")
	}
	i.Status = "invalid"
	i.InvalidReason = "canceled"
	i.RespondedAt = time.Now().UnixMilli()
	s.persistLocked()
	copy := *i
	return &copy, nil
}

func (s *store) setHero(partyID, playerID, hero string) (*Party, error) {
	p, ok := s.parties[partyID]
	if !ok {
		return nil, errors.New("party not found")
	}
	for index := range p.Members {
		if p.Members[index].PlayerID == playerID {
			p.Members[index].Hero = strings.TrimSpace(hero)
			s.touchParty(p)
			s.persistLocked()
			return cloneParty(p), nil
		}
	}
	return nil, errors.New("player is not in party")
}

func (s *store) leave(partyID, playerID string) (*Party, error) {
	party, ok := s.parties[partyID]
	if !ok {
		return nil, errors.New("party not found")
	}
	memberIndex := -1
	for index, member := range party.Members {
		if member.PlayerID == playerID {
			memberIndex = index
			break
		}
	}
	if memberIndex < 0 {
		return nil, errors.New("player is not in party")
	}
	party.Members = append(party.Members[:memberIndex], party.Members[memberIndex+1:]...)
	party.BattleNonce = ""
	party.BattleStartedAt = 0
	party.BattleMap = ""
	if len(party.Members) <= 1 {
		delete(s.parties, partyID)
		s.persistLocked()
		return nil, nil
	}
	if party.OwnerID == playerID {
		party.OwnerID = party.Members[0].PlayerID
	}
	for index := range party.Members {
		party.Members[index].Owner = party.Members[index].PlayerID == party.OwnerID
	}
	s.touchParty(party)
	s.persistLocked()
	return cloneParty(party), nil
}

func (s *store) kick(partyID, ownerID, targetID string) (*Party, error) {
	party, ok := s.parties[partyID]
	if !ok {
		return nil, errors.New("party not found")
	}
	if party.OwnerID != ownerID {
		return nil, errors.New("only party owner can kick members")
	}
	if ownerID == targetID {
		return nil, errors.New("party owner cannot kick self")
	}
	memberIndex := -1
	for index, member := range party.Members {
		if member.PlayerID == targetID {
			memberIndex = index
			break
		}
	}
	if memberIndex < 0 {
		return nil, errors.New("player is not in party")
	}
	party.Members = append(party.Members[:memberIndex], party.Members[memberIndex+1:]...)
	party.BattleNonce = ""
	party.BattleStartedAt = 0
	party.BattleMap = ""
	if len(party.Members) <= 1 {
		delete(s.parties, partyID)
		s.persistLocked()
		return nil, nil
	}
	s.touchParty(party)
	s.persistLocked()
	return cloneParty(party), nil
}

func normalizePartyBattleMap(mapName string) string {
	switch strings.ToLower(strings.TrimSpace(mapName)) {
	case "team-battle":
		return "team-battle"
	case "team-battle-northern":
		return "team-battle-northern"
	default:
		return defaultPartyBattleMap
	}
}

func (s *store) startBattle(partyID, playerID string, requestedMap ...string) (*Party, error) {
	party, ok := s.parties[partyID]
	if !ok {
		return nil, errors.New("party not found")
	}
	isMember := false
	for _, member := range party.Members {
		if member.PlayerID == playerID {
			isMember = true
			break
		}
	}
	if !isMember {
		return nil, errors.New("player is not in party")
	}
	if party.BattleNonce != "" && time.Since(time.UnixMilli(party.BattleStartedAt)) <= partyBattleStartTTL {
		return cloneParty(party), nil
	}
	mapName := defaultPartyBattleMap
	if len(requestedMap) > 0 {
		mapName = normalizePartyBattleMap(requestedMap[0])
	}
	party.BattleNonce = s.next("battle")
	party.BattleStartedAt = time.Now().UnixMilli()
	party.BattleMap = mapName
	s.touchParty(party)
	s.persistLocked()
	return cloneParty(party), nil
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
	state              *store
	maxPartySize       int
	hub                *inviteHub
	inviteWriter       *kafka.Writer
	inviteStatusWriter *kafka.Writer
	accountURL         string
}

var accountHTTPClient = &http.Client{Timeout: accountRequestTimeout}

type inviteHub struct {
	mu      sync.Mutex
	clients map[string]map[*hubClient]struct{}
}

type hubClient struct {
	conn    *websocket.Conn
	writeMu sync.Mutex
}

func newInviteHub() *inviteHub { return &inviteHub{clients: map[string]map[*hubClient]struct{}{}} }
func (h *inviteHub) add(userID string, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.clients[userID] == nil {
		h.clients[userID] = map[*hubClient]struct{}{}
	}
	h.clients[userID][&hubClient{conn: conn}] = struct{}{}
}
func (h *inviteHub) remove(userID string, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for client := range h.clients[userID] {
		if client.conn == conn {
			delete(h.clients[userID], client)
			break
		}
	}
	if len(h.clients[userID]) == 0 {
		delete(h.clients, userID)
	}
}
func (h *inviteHub) notify(userID string, invite *Invite) {
	h.notifyPayload(userID, map[string]any{"type": "party_invite", "invite": invite})
}
func (h *inviteHub) notifyPayload(userID string, payload any) {
	h.mu.Lock()
	clients := make([]*hubClient, 0, len(h.clients[userID]))
	for client := range h.clients[userID] {
		clients = append(clients, client)
	}
	h.mu.Unlock()
	for _, client := range clients {
		client.writeMu.Lock()
		_ = client.conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
		err := client.conn.WriteJSON(payload)
		client.writeMu.Unlock()
		if err != nil {
			h.mu.Lock()
			if clientsForUser := h.clients[userID]; clientsForUser != nil {
				delete(clientsForUser, client)
				if len(clientsForUser) == 0 {
					delete(h.clients, userID)
				}
			}
			h.mu.Unlock()
			_ = client.conn.Close()
		}
	}
}

func (s *server) notifyPartyUpdate(party *Party) {
	if s == nil || s.hub == nil || party == nil {
		return
	}
	for _, member := range party.Members {
		payload := map[string]any{"type": "party_update", "party": partyViewFor(party, member.PlayerID)}
		s.hub.notifyPayload(member.PlayerID, payload)
	}
}

func (s *server) notifyPartyRemoved(playerID string) {
	if s == nil || s.hub == nil || strings.TrimSpace(playerID) == "" {
		return
	}
	s.hub.notifyPayload(playerID, map[string]any{"type": "party_update", "party": nil})
}

func (s *server) notifyInviteStatus(invite *Invite) {
	if s == nil || s.hub == nil || invite == nil {
		return
	}
	copy := *invite
	payload := map[string]any{"type": "party_invite_status", "invite": &copy}
	s.hub.notifyPayload(invite.FromID, payload)
	if invite.ToID != invite.FromID {
		s.hub.notifyPayload(invite.ToID, payload)
	}
}

var wsUpgrader = websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}

func userID(r *http.Request) string {
	if !isProductionEnvironment() {
		if id := strings.TrimSpace(r.Header.Get("X-User-ID")); id != "" {
			return id
		}
	}
	auth := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	parts := strings.Split(auth, ".")
	if len(parts) == 2 && verifyJWT(parts, os.Getenv("APP_AUTH_SECRET")) {
		if payload, err := base64.RawURLEncoding.DecodeString(parts[0]); err == nil {
			var value struct {
				Sub json.RawMessage `json:"sub"`
				Exp int64           `json:"exp"`
			}
			if json.Unmarshal(payload, &value) == nil {
				subject := ""
				if json.Unmarshal(value.Sub, &subject) != nil {
					var numericSubject int64
					if json.Unmarshal(value.Sub, &numericSubject) == nil {
						subject = strconv.FormatInt(numericSubject, 10)
					}
				}
				if value.Exp > time.Now().Unix() && strings.TrimSpace(subject) != "" {
					return strings.TrimSpace(subject)
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
	if id == "" && !isProductionEnvironment() {
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
	conn.SetReadLimit(4 << 10)
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
	ctx, cancel := context.WithTimeout(context.Background(), kafkaPublishTimeout)
	defer cancel()
	return writer.WriteMessages(ctx, kafka.Message{Key: []byte(invite.ToID), Value: value})
}

func publishInviteStatus(writer *kafka.Writer, invite *Invite) error {
	if writer == nil {
		return nil
	}
	value, err := json.Marshal(inviteEvent{Invite: invite})
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), kafkaPublishTimeout)
	defer cancel()
	return writer.WriteMessages(ctx, kafka.Message{Key: []byte(invite.ID), Value: value})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func decode(r *http.Request, value any) error {
	if r == nil || r.Body == nil {
		return io.EOF
	}
	decoder := json.NewDecoder(io.LimitReader(r.Body, maxJSONBodyBytes))
	if err := decoder.Decode(value); err != nil {
		return err
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		if err == nil {
			return errors.New("request body contains multiple JSON values")
		}
		return err
	}
	return nil
}

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
	response, err := accountHTTPClient.Do(request)
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
		Nickname string `json:"nickname"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&profile); err != nil {
		return "", err
	}
	name := strings.TrimSpace(profile.Nickname)
	if name == "" {
		name = strings.TrimSpace(profile.FullName)
	}
	if name == "" {
		name = strings.TrimSpace(profile.Username)
	}
	if name == "" {
		name = playerID
	}
	return name, nil
}

func (s *server) lookupPlayers(prefix string) ([]PlayerSearchResult, error) {
	prefix = strings.TrimSpace(prefix)
	if utf8.RuneCountInString(prefix) < 2 {
		return nil, errors.New("query must contain at least 2 characters")
	}
	if s.accountURL == "" {
		return nil, errors.New("account service is not configured")
	}
	endpoint, err := url.Parse(strings.TrimRight(s.accountURL, "/") + "/users/search")
	if err != nil {
		return nil, err
	}
	query := endpoint.Query()
	query.Set("query", prefix)
	query.Set("limit", "20")
	endpoint.RawQuery = query.Encode()
	request, err := http.NewRequest(http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return nil, err
	}
	response, err := accountHTTPClient.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, fmt.Errorf("account service returned %s", response.Status)
	}
	var profiles []struct {
		PlayerID int64  `json:"player_id"`
		Username string `json:"username"`
		FullName string `json:"full_name"`
		Nickname string `json:"nickname"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&profiles); err != nil {
		return nil, err
	}
	players := make([]PlayerSearchResult, 0, len(profiles))
	for _, profile := range profiles {
		playerID := strconv.FormatInt(profile.PlayerID, 10)
		name := strings.TrimSpace(profile.Nickname)
		if name == "" {
			name = strings.TrimSpace(profile.FullName)
		}
		if name == "" {
			name = strings.TrimSpace(profile.Username)
		}
		if name == "" {
			name = playerID
		}
		players = append(players, PlayerSearchResult{PlayerID: playerID, Name: name})
	}
	return players, nil
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
		s.sweepExpiredInvites()
		s.state.mu.RLock()
		items := s.state.pending(id)
		s.state.mu.RUnlock()
		writeJSON(w, http.StatusOK, items)
		return
	}
	if r.Method == "GET" && r.URL.Path == "/party/invites/inbox" {
		id := s.requireUser(w, r)
		if id == "" {
			return
		}
		s.sweepExpiredInvites()
		s.state.mu.RLock()
		items := s.state.inbox(id)
		s.state.mu.RUnlock()
		writeJSON(w, http.StatusOK, items)
		return
	}
	if r.Method == "GET" && r.URL.Path == "/party/invites/outgoing" {
		id := s.requireUser(w, r)
		if id == "" {
			return
		}
		s.sweepExpiredInvites()
		s.state.mu.RLock()
		items := s.state.outgoing(id)
		s.state.mu.RUnlock()
		writeJSON(w, http.StatusOK, items)
		return
	}
	if r.Method == "GET" && r.URL.Path == "/party/mine" {
		id := s.requireUser(w, r)
		if id == "" {
			return
		}
		s.state.mu.RLock()
		party := s.state.partyFor(id)
		s.state.mu.RUnlock()
		writeJSON(w, http.StatusOK, party)
		return
	}
	if r.Method == "GET" && r.URL.Path == "/party/search" {
		id := s.requireUser(w, r)
		if id == "" {
			return
		}
		target := strings.TrimSpace(r.URL.Query().Get("query"))
		if target == "" {
			target = strings.TrimSpace(r.URL.Query().Get("playerId"))
		}
		if utf8.RuneCountInString(target) < 2 {
			http.Error(w, "query must contain at least 2 characters", http.StatusBadRequest)
			return
		}
		players, err := s.lookupPlayers(target)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		result := make([]PlayerSearchResult, 0, len(players))
		for _, player := range players {
			if player.PlayerID != id {
				result = append(result, player)
			}
		}
		writeJSON(w, http.StatusOK, result)
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
		if err := decode(r, &req); err != nil && !errors.Is(err, io.EOF) {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
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
		p := s.state.partyFor(id)
		status := http.StatusOK
		if p == nil {
			p = s.state.createParty(id, req.Name, req.MaxSize)
			status = http.StatusCreated
		}
		s.state.mu.Unlock()
		writeJSON(w, status, p)
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
		p, transition, err := s.state.acceptWithTransition(inviteID, id, name)
		s.state.mu.Unlock()
		if err != nil {
			s.state.mu.RLock()
			var invalidInvite *Invite
			if stored := s.state.invitations[inviteID]; stored != nil && stored.Status == "invalid" {
				copy := *stored
				invalidInvite = &copy
			}
			s.state.mu.RUnlock()
			if invalidInvite != nil {
				s.notifyInviteStatus(invalidInvite)
				if publishErr := publishInviteStatus(s.inviteStatusWriter, invalidInvite); publishErr != nil {
					log.Printf("party invite invalidation delivery: %v", publishErr)
				}
			}
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		for _, invite := range transition.inviteStatuses {
			s.notifyInviteStatus(invite)
			if publishErr := publishInviteStatus(s.inviteStatusWriter, invite); publishErr != nil {
				log.Printf("party invite transition delivery: %v", publishErr)
			}
		}
		for _, updatedParty := range transition.updated {
			s.notifyPartyUpdate(updatedParty)
		}
		for _, memberID := range transition.removed {
			s.notifyPartyRemoved(memberID)
		}
		s.notifyPartyUpdate(p)
		writeJSON(w, http.StatusOK, partyViewFor(p, id))
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
		var invite *Invite
		var disbandedMemberIDs []string
		var invalidated []*Invite
		if stored := s.state.invitations[inviteID]; stored != nil {
			copy := *stored
			invite = &copy
			if err == nil {
				disbandedMemberIDs, invalidated = s.state.disbandSoloPartyWithInvitesLocked(stored.PartyID)
			}
		}
		s.state.mu.Unlock()
		if err != nil {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		s.notifyInviteStatus(invite)
		for _, memberID := range disbandedMemberIDs {
			s.notifyPartyRemoved(memberID)
		}
		for _, invalidatedInvite := range invalidated {
			s.notifyInviteStatus(invalidatedInvite)
			if publishErr := publishInviteStatus(s.inviteStatusWriter, invalidatedInvite); publishErr != nil {
				log.Printf("party invite invalidation delivery: %v", publishErr)
			}
		}
		if err := publishInviteStatus(s.inviteStatusWriter, invite); err != nil {
			http.Error(w, "invite status delivery unavailable", http.StatusServiceUnavailable)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "declined"})
		return
	}
	if r.Method == "POST" && strings.HasPrefix(r.URL.Path, "/party/invites/") && strings.HasSuffix(r.URL.Path, "/cancel") {
		id := s.requireUser(w, r)
		if id == "" {
			return
		}
		inviteID := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/party/invites/"), "/cancel")
		s.state.mu.Lock()
		invite, err := s.state.cancel(inviteID, id)
		var disbandedMemberIDs []string
		var invalidated []*Invite
		if err == nil {
			disbandedMemberIDs, invalidated = s.state.disbandSoloPartyWithInvitesLocked(invite.PartyID)
		}
		s.state.mu.Unlock()
		if err != nil {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		s.notifyInviteStatus(invite)
		for _, memberID := range disbandedMemberIDs {
			s.notifyPartyRemoved(memberID)
		}
		for _, invalidatedInvite := range invalidated {
			s.notifyInviteStatus(invalidatedInvite)
			if publishErr := publishInviteStatus(s.inviteStatusWriter, invalidatedInvite); publishErr != nil {
				log.Printf("party invite invalidation delivery: %v", publishErr)
			}
		}
		if err := publishInviteStatus(s.inviteStatusWriter, invite); err != nil {
			http.Error(w, "invite status delivery unavailable", http.StatusServiceUnavailable)
			return
		}
		writeJSON(w, http.StatusOK, invite)
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
			ToName   string `json:"toName"`
		}
		if err := decode(r, &req); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		if !validPlayerID(req.PlayerID) {
			http.Error(w, "playerId is required", http.StatusBadRequest)
			return
		}
		s.sweepExpiredInvites()
		s.state.mu.Lock()
		invite, err := s.state.addInviteWithName(id, id, partyID, strings.TrimSpace(req.PlayerID), req.ToName)
		if err == nil {
			s.state.cacheInvite(invite)
		}
		s.state.mu.Unlock()
		if err != nil {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		if err := publishInvite(s.inviteWriter, invite); err != nil {
			s.state.mu.Lock()
			if stored := s.state.invitations[invite.ID]; stored != nil && stored.Status == "pending" {
				delete(s.state.invitations, invite.ID)
				s.state.persistLocked()
			}
			s.state.mu.Unlock()
			http.Error(w, "invite delivery unavailable", http.StatusServiceUnavailable)
			return
		}
		writeJSON(w, http.StatusCreated, invite)
		return
	}
	if r.Method == "DELETE" && strings.HasPrefix(r.URL.Path, "/party/") && strings.Contains(r.URL.Path, "/members/") {
		id := s.requireUser(w, r)
		if id == "" {
			return
		}
		path := strings.TrimPrefix(r.URL.Path, "/party/")
		parts := strings.Split(path, "/members/")
		if len(parts) != 2 || parts[1] == "" || parts[0] == "" {
			http.Error(w, "invalid party member path", http.StatusBadRequest)
			return
		}
		s.state.mu.Lock()
		var party *Party
		var err error
		var invalidated []*Invite
		if parts[1] == id {
			party, err = s.state.leave(parts[0], id)
		} else {
			party, err = s.state.kick(parts[0], id, parts[1])
		}
		if err == nil && party == nil {
			invalidated = s.state.invalidatePartyInvitesLocked(parts[0], "party_disbanded")
		}
		s.state.mu.Unlock()
		if err != nil {
			status := http.StatusConflict
			if parts[1] != id && err.Error() == "only party owner can kick members" {
				status = http.StatusForbidden
			}
			http.Error(w, err.Error(), status)
			return
		}
		s.notifyPartyUpdate(party)
		for _, invite := range invalidated {
			s.notifyInviteStatus(invite)
			if publishErr := publishInviteStatus(s.inviteStatusWriter, invite); publishErr != nil {
				log.Printf("party invite invalidation delivery: %v", publishErr)
			}
		}
		if parts[1] != id {
			s.notifyPartyRemoved(parts[1])
		}
		writeJSON(w, http.StatusOK, map[string]any{"status": "left", "party": party})
		return
	}
	if r.Method == "POST" && strings.HasPrefix(r.URL.Path, "/party/") && strings.HasSuffix(r.URL.Path, "/start") {
		id := s.requireUser(w, r)
		if id == "" {
			return
		}
		partyID := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/party/"), "/start")
		var request struct {
			MapName string `json:"mapName"`
		}
		if err := decode(r, &request); err != nil && err != io.EOF {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		s.state.mu.Lock()
		p, err := s.state.startBattle(partyID, id, request.MapName)
		s.state.mu.Unlock()
		if err != nil {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		s.notifyPartyUpdate(p)
		writeJSON(w, http.StatusOK, partyViewFor(p, id))
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
		if err := decode(r, &req); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		req.Hero = limitText(req.Hero, 64)
		s.state.mu.Lock()
		p, err := s.state.setHero(parts[0], id, req.Hero)
		s.state.mu.Unlock()
		if err != nil {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		s.notifyPartyUpdate(p)
		writeJSON(w, http.StatusOK, partyViewFor(p, id))
		return
	}
	if r.Method == "GET" && strings.HasPrefix(r.URL.Path, "/party/") {
		id := s.requireUser(w, r)
		if id == "" {
			return
		}
		partyID := strings.TrimPrefix(r.URL.Path, "/party/")
		s.state.mu.RLock()
		p := s.state.parties[partyID]
		isMember := p != nil && partyHasMember(p, id)
		view := partyViewFor(p, id)
		s.state.mu.RUnlock()
		if !isMember {
			http.NotFound(w, r)
			return
		}
		writeJSON(w, http.StatusOK, view)
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
			accepted := state.cacheInvite(event.Invite)
			current := state.invitations[event.Invite.ID]
			shouldNotify := accepted || (current != nil && current.Status == "pending")
			state.mu.Unlock()
			if shouldNotify {
				hub.notify(event.Invite.ToID, event.Invite)
			}
		}
	}()
}

func consumeInviteStatuses(state *store, hub *inviteHub, addr string) {
	if addr == "" {
		return
	}
	reader := kafka.NewReader(kafka.ReaderConfig{Brokers: []string{addr}, Topic: inviteStatusTopic, GroupID: "party-service-invite-status", MinBytes: 1, MaxBytes: 1e6})
	go func() {
		defer reader.Close()
		for {
			message, err := reader.ReadMessage(context.Background())
			if err != nil {
				log.Printf("party invite status consumer: %v", err)
				return
			}
			var event inviteEvent
			if json.Unmarshal(message.Value, &event) != nil || event.Invite == nil {
				continue
			}
			state.mu.Lock()
			accepted := state.cacheInvite(event.Invite)
			state.mu.Unlock()
			if accepted {
				hub.notifyPayload(event.Invite.FromID, map[string]any{"type": "party_invite_status", "invite": event.Invite})
				if event.Invite.ToID != event.Invite.FromID {
					hub.notifyPayload(event.Invite.ToID, map[string]any{"type": "party_invite_status", "invite": event.Invite})
				}
			}
		}
	}()
}

func (s *server) sweepExpiredInvites() {
	if s == nil || s.state == nil {
		return
	}
	s.state.mu.Lock()
	invalidated := s.state.invalidateExpiredLocked(time.Now().UnixMilli())
	invalidated = append(invalidated, s.state.invalidateOrphanedPartyInvitesLocked()...)
	statusEvents := append([]*Invite(nil), invalidated...)
	disbandedMemberIDs := []string{}
	for _, invite := range invalidated {
		removed, disbandedInvites := s.state.disbandSoloPartyWithInvitesLocked(invite.PartyID)
		disbandedMemberIDs = append(disbandedMemberIDs, removed...)
		statusEvents = append(statusEvents, disbandedInvites...)
	}
	s.state.mu.Unlock()
	for _, invite := range statusEvents {
		s.notifyInviteStatus(invite)
		if err := publishInviteStatus(s.inviteStatusWriter, invite); err != nil {
			log.Printf("party expired invite delivery: %v", err)
		}
	}
	for _, memberID := range disbandedMemberIDs {
		s.notifyPartyRemoved(memberID)
	}
}

func (s *server) runInviteExpiry() {
	go func() {
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		for range ticker.C {
			s.sweepExpiredInvites()
		}
	}()
}

func main() {
	state := loadStore(os.Getenv("PARTY_STORE_PATH"))
	broker := os.Getenv("KAFKA_ADDR")
	hub := newInviteHub()
	consumeResults(state, broker)
	consumeInvites(state, hub, broker)
	consumeInviteStatuses(state, hub, broker)
	port := os.Getenv("PORT")
	if port == "" {
		port = "8002"
	}
	maxPartySize := maxDefaultPartySize
	if configured, err := strconv.Atoi(os.Getenv("MAX_PARTY_SIZE")); err == nil && configured >= 2 && configured <= 9 {
		maxPartySize = configured
	}
	var inviteWriter *kafka.Writer
	var inviteStatusWriter *kafka.Writer
	if broker != "" {
		inviteWriter = kafka.NewWriter(kafka.WriterConfig{Brokers: []string{broker}, Topic: inviteTopic, Balancer: &kafka.LeastBytes{}, RequiredAcks: int(kafka.RequireOne), Dialer: &kafka.Dialer{Timeout: kafkaPublishTimeout}, ReadTimeout: kafkaPublishTimeout, WriteTimeout: kafkaPublishTimeout})
		inviteStatusWriter = kafka.NewWriter(kafka.WriterConfig{Brokers: []string{broker}, Topic: inviteStatusTopic, Balancer: &kafka.LeastBytes{}, RequiredAcks: int(kafka.RequireOne), Dialer: &kafka.Dialer{Timeout: kafkaPublishTimeout}, ReadTimeout: kafkaPublishTimeout, WriteTimeout: kafkaPublishTimeout})
	}
	accountURL := os.Getenv("ACCOUNT_URL")
	partyServer := &server{state: state, maxPartySize: maxPartySize, hub: hub, inviteWriter: inviteWriter, inviteStatusWriter: inviteStatusWriter, accountURL: accountURL}
	partyServer.runInviteExpiry()
	log.Printf("party service listening on %s", port)
	log.Fatal(http.ListenAndServe(":"+port, partyServer))
}
