package room

import (
	"battle/model/game"
	"battle/model/room"
	"encoding/json"
	"math/rand"
	"sync"
	"time"
)

type TeamMatchConfig struct {
	TeamSize     int
	PartyMaxSize int
}

var DefaultTeamMatchConfig = TeamMatchConfig{
	TeamSize:     room.DefaultTeamSize,
	PartyMaxSize: room.DefaultPartyMaxSize,
}

// ConfigureTeamMatchConfig applies deployment configuration once at startup.
// Keeping the limits in the battle service prevents a party accepted by the
// party service from being rejected later by a stale queue limit.
func ConfigureTeamMatchConfig(config TeamMatchConfig) {
	if config.TeamSize >= 2 && config.TeamSize <= 9 {
		DefaultTeamMatchConfig.TeamSize = config.TeamSize
	}
	if config.PartyMaxSize >= 2 && config.PartyMaxSize <= DefaultTeamMatchConfig.TeamSize {
		DefaultTeamMatchConfig.PartyMaxSize = config.PartyMaxSize
	}
}

const teamBotFallbackDelay = 3 * time.Second

var matchQueue = &MatchQueue{}

func AddToMatchQueue(client *room.Client) {
	matchQueue.Add(client)
}

func RemoveFromMatchQueue(clientId string) {
	matchQueue.Remove(clientId)
}

func MatchQueueLength() int {
	matchQueue.mu.Lock()
	defer matchQueue.mu.Unlock()
	return len(matchQueue.queue)
}

type MatchQueue struct {
	queue    []*room.Client
	queuedAt map[string]time.Time
	mu       sync.Mutex
}

func (mq *MatchQueue) Add(client *room.Client) {
	if client == nil || client.Id == "" {
		return
	}
	mq.mu.Lock()
	if mq.queuedAt == nil {
		mq.queuedAt = make(map[string]time.Time)
	}
	// A repeated find_match command is a requeue, not a second participant.
	// Keeping duplicate pointers here can create multiple rooms for one user
	// and makes cancellation remove only one of the stale entries.
	filtered := mq.queue[:0]
	for _, queued := range mq.queue {
		if queued == nil || queued.Id == client.Id {
			continue
		}
		filtered = append(filtered, queued)
	}
	mq.queue = filtered
	mq.queuedAt[client.Id] = time.Now()
	mq.queue = append(mq.queue, client)
	mq.tryMatch()
	mq.mu.Unlock()
	if client.Profile.Mode == game.ModeTeamDeathmatch {
		go func() { time.Sleep(teamBotFallbackDelay); mq.mu.Lock(); mq.tryMatch(); mq.mu.Unlock() }()
	}
}

func (mq *MatchQueue) Remove(clientId string) {
	mq.mu.Lock()
	defer mq.mu.Unlock()
	filtered := mq.queue[:0]
	for _, c := range mq.queue {
		if c == nil || c.Id == clientId {
			continue
		}
		filtered = append(filtered, c)
	}
	mq.queue = filtered
	delete(mq.queuedAt, clientId)
}

func (mq *MatchQueue) tryMatch() {
	for len(mq.queue) > 0 {
		teamIndex := mq.firstTeamQueueIndex()
		if teamIndex >= 0 && mq.tryTeamMatch(teamIndex) {
			continue
		}
		p := mq.queue[0]
		if p.Profile.Mode == game.ModeTeamDeathmatch {
			// A team queue can wait while a different solo profile is still
			// allowed to use the legacy immediate-match path.
			for i := 1; i < len(mq.queue); i++ {
				if mq.queue[i].Profile.Mode != game.ModeTeamDeathmatch {
					p = mq.queue[i]
					mq.queue = append(mq.queue[:i], mq.queue[i+1:]...)
					mq.matchSolo(p)
					continue
				}
			}
			break
		}
		mq.queue = mq.queue[1:]
		mq.matchSolo(p)
	}
}

func (mq *MatchQueue) matchSolo(p *room.Client) {
	profile := p.Profile
	if profile == (room.MatchProfile{}) {
		profile = room.DefaultMatchProfile()
		p.Profile = profile
	}

	existing := room.FindLobbyRoomFor(profile)
	if existing != nil {
		p.PendingRoomID = existing.Id
		data, _ := json.Marshal(game.NewServerMessage("match_found", game.MatchFoundParams{RoomId: existing.Id}))
		p.TrySend(data)
		return
	}

	roomName := generateRoomId()
	r := room.GetOrCreateRoomFor(roomName, roomName, profile)

	p.PendingRoomID = r.Id
	data, _ := json.Marshal(game.NewServerMessage("match_found", game.MatchFoundParams{RoomId: r.Id}))
	p.TrySend(data)
}

func (mq *MatchQueue) firstTeamQueueIndex() int {
	for i, client := range mq.queue {
		if client.Profile.Mode == game.ModeTeamDeathmatch {
			return i
		}
	}
	return -1
}

func (mq *MatchQueue) tryTeamMatch(_ int) bool {
	profile := room.DefaultMatchProfile()
	for _, client := range mq.queue {
		if client.Profile.Mode == game.ModeTeamDeathmatch {
			profile = client.Profile
			break
		}
	}
	config := DefaultTeamMatchConfig
	if config.TeamSize <= 0 || config.PartyMaxSize <= 0 {
		return false
	}
	units := make([]MatchUnit, 0)
	unitIndexes := make([][]int, 0)
	groups := make(map[string][]int)
	for index, client := range mq.queue {
		if client.Profile.Mode != game.ModeTeamDeathmatch || !profile.Compatible(client.Profile) {
			continue
		}
		partyID := client.PartyID
		if partyID == "" {
			partyID = client.Id
		}
		groups[partyID] = append(groups[partyID], index)
	}
	for partyID, indexes := range groups {
		expected := mq.queue[indexes[0]].PartySize
		if expected <= 0 {
			expected = 1
		}
		// Party membership is optional for matchmaking: only members who
		// actually pressed search are queued. Offline party members must not
		// block the searching player from entering a bot-filled match.
		if expected > config.PartyMaxSize || len(indexes) > expected {
			continue
		}
		members := make([]MatchMember, 0, len(indexes))
		for _, index := range indexes {
			members = append(members, MatchMember{ID: mq.queue[index].Id, Hero: mq.queue[index].HeroName})
		}
		units = append(units, MatchUnit{PartyID: partyID, Members: members})
		unitIndexes = append(unitIndexes, indexes)
	}
	selectedUnits := make([]int, 0)
	selectedPlayers := 0
	for index, unit := range units {
		if selectedPlayers+len(unit.Members) > config.TeamSize*2 {
			continue
		}
		selectedUnits = append(selectedUnits, index)
		selectedPlayers += len(unit.Members)
		if selectedPlayers == config.TeamSize*2 {
			break
		}
	}
	chosen := make([]MatchUnit, 0, len(selectedUnits))
	chosenIndexes := make([]int, 0, selectedPlayers)
	for _, unitIndex := range selectedUnits {
		chosen = append(chosen, units[unitIndex])
		chosenIndexes = append(chosenIndexes, unitIndexes[unitIndex]...)
	}
	if selectedPlayers != config.TeamSize*2 && (selectedPlayers == 0 || !mq.teamFallbackReady(chosenIndexes)) {
		return false
	}
	assignments, ok := FormTeamAssignments(chosen, config.TeamSize)
	if selectedPlayers != config.TeamSize*2 {
		assignments, ok = FormPartialTeamAssignments(chosen, config.TeamSize)
	}
	if !ok {
		return false
	}
	return mq.launchTeamMatch(profile, chosenIndexes, assignments)
}

func (mq *MatchQueue) teamFallbackReady(indexes []int) bool {
	if len(indexes) == 0 {
		return false
	}
	oldest := time.Now()
	for _, index := range indexes {
		if queued := mq.queuedAt[mq.queue[index].Id]; !queued.IsZero() && queued.Before(oldest) {
			oldest = queued
		}
	}
	return time.Since(oldest) >= teamBotFallbackDelay
}

func (mq *MatchQueue) launchTeamMatch(profile room.MatchProfile, chosenIndexes []int, assignments map[string]string) bool {
	if rand.Intn(2) == 0 {
		swapTeamAssignmentSides(assignments)
	}
	r := room.GetOrCreateRoomFor(generateRoomId(), "team-match", profile)
	for _, queueIndex := range chosenIndexes {
		client := mq.queue[queueIndex]
		client.AssignedTeam = assignments[client.Id]
		client.PendingRoomID = r.Id
		data, _ := json.Marshal(game.NewServerMessage("match_found", game.MatchFoundParams{RoomId: r.Id}))
		client.TrySend(data)
	}
	remove := make(map[int]bool)
	for _, index := range chosenIndexes {
		remove[index] = true
	}
	remaining := mq.queue[:0]
	for index, client := range mq.queue {
		if !remove[index] {
			remaining = append(remaining, client)
		} else {
			delete(mq.queuedAt, client.Id)
		}
	}
	mq.queue = remaining
	return true
}

// swapTeamAssignmentSides keeps the balanced roster intact while randomizing
// which authored base each team starts from. The client still presents the
// local team as friendly and the opposing team as red, independent of this
// server-side Blue/Red label swap.
func swapTeamAssignmentSides(assignments map[string]string) {
	for playerID, team := range assignments {
		switch team {
		case "Blue":
			assignments[playerID] = "Red"
		case "Red":
			assignments[playerID] = "Blue"
		}
	}
}

func generateRoomId() string {
	b := make([]byte, 8)
	for i := range b {
		b[i] = "abcdefghijklmnopqrstuvwxyz0123456789"[time.Now().UnixNano()%36]
		time.Sleep(time.Nanosecond)
	}
	return string(b)
}
