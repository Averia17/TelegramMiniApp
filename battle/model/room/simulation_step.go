package room

import (
	"battle/model/game"
	"time"
)

// simulationStep is the transport-independent result of one authoritative
// simulation step. Room.Run owns scheduling and delivery; this seam owns only
// advancing GameState and preparing snapshots.
type simulationStep struct {
	tickStarted    time.Time
	tickGap        time.Duration
	updateDuration time.Duration
	snapshot       time.Duration
	updates        []preparedStateUpdate
	hasClients     bool
}

func (r *Room) stepSimulation(previousTickAt time.Time, frame int, now time.Time) simulationStep {
	step := simulationStep{tickStarted: now}
	if !previousTickAt.IsZero() {
		step.tickGap = now.Sub(previousTickAt)
	}
	elapsed := battleTickElapsed(previousTickAt, now)

	r.mu.Lock()
	r.expireDisconnectedPlayers()
	if r.State == nil || (len(r.Clients) == 0 && r.State.State != game.GameStateGame) {
		r.mu.Unlock()
		return step
	}
	// Transport delivery is optional once combat has started. The authoritative
	// match must keep advancing when every human disconnects so bots can finish
	// the fight and the result can be persisted for a later recovery request.
	step.hasClients = len(r.Clients) > 0
	frame++
	started := time.Now()
	r.State.UpdateWithDelta(elapsed)
	step.updateDuration = time.Since(started)
	if shouldPublishState(frame) {
		snapshotStarted := time.Now()
		step.updates = r.prepareStateUpdates()
		step.snapshot = time.Since(snapshotStarted)
	}
	r.mu.Unlock()
	return step
}
