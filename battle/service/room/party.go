package room

import (
	"errors"
	"sort"
	"sync"
)

var (
	ErrInvalidParty   = errors.New("party id and player id are required")
	ErrPartyFull      = errors.New("party is full")
	ErrAlreadyInParty = errors.New("player is already in another party")
)

// PartySnapshot is the small, transport-safe view of a party. Member order is
// stable so clients can render the same roster and tests remain deterministic.
type PartySnapshot struct {
	ID        string
	OwnerID   string
	MaxSize   int
	MemberIDs []string
	Count     int
}

type party struct {
	id      string
	ownerID string
	maxSize int
	members map[string]struct{}
}

// PartyRegistry owns party membership independently from the matchmaking
// queue. A party can therefore be validated before its members enter search.
type PartyRegistry struct {
	mu       sync.Mutex
	parties  map[string]*party
	byPlayer map[string]string
}

func NewPartyRegistry() *PartyRegistry {
	return &PartyRegistry{
		parties:  make(map[string]*party),
		byPlayer: make(map[string]string),
	}
}

func (r *PartyRegistry) Join(partyID, playerID string, maxSize int) (PartySnapshot, error) {
	if partyID == "" || playerID == "" {
		return PartySnapshot{}, ErrInvalidParty
	}
	if maxSize <= 0 {
		maxSize = DefaultTeamMatchConfig.PartyMaxSize
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	if current, ok := r.byPlayer[playerID]; ok && current != partyID {
		return PartySnapshot{}, ErrAlreadyInParty
	}
	p := r.parties[partyID]
	if p == nil {
		p = &party{id: partyID, ownerID: playerID, maxSize: maxSize, members: make(map[string]struct{})}
		r.parties[partyID] = p
	}
	if _, exists := p.members[playerID]; !exists && len(p.members) >= p.maxSize {
		return PartySnapshot{}, ErrPartyFull
	}
	p.members[playerID] = struct{}{}
	r.byPlayer[playerID] = partyID
	return snapshotParty(p), nil
}

func (r *PartyRegistry) Leave(playerID string) {
	if playerID == "" {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	partyID := r.byPlayer[playerID]
	delete(r.byPlayer, playerID)
	p := r.parties[partyID]
	if p == nil {
		return
	}
	delete(p.members, playerID)
	if len(p.members) == 0 {
		delete(r.parties, partyID)
	}
}

func (r *PartyRegistry) Snapshot(partyID string) (PartySnapshot, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	p, ok := r.parties[partyID]
	if !ok {
		return PartySnapshot{}, false
	}
	return snapshotParty(p), true
}

func snapshotParty(p *party) PartySnapshot {
	members := make([]string, 0, len(p.members))
	for memberID := range p.members {
		members = append(members, memberID)
	}
	sort.Strings(members)
	return PartySnapshot{ID: p.id, OwnerID: p.ownerID, MaxSize: p.maxSize, MemberIDs: members, Count: len(members)}
}
