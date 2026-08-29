package deployment

import (
	"sync"
	"time"
)

// State is process-local on purpose: the deployment drains one battle
// container at a time, and the deployer talks to the exact instance before it
// is recreated. Redis-backed matchmaking remains untouched by this flag.
type State struct {
	mu        sync.RWMutex
	draining  bool
	message   string
	startedAt time.Time
}

var current State

func Begin(message string) bool {
	current.mu.Lock()
	defer current.mu.Unlock()
	if current.draining {
		return false
	}
	current.draining = true
	current.message = message
	current.startedAt = time.Now().UTC()
	return true
}

func Resume() {
	current.mu.Lock()
	defer current.mu.Unlock()
	current.draining = false
	current.message = ""
	current.startedAt = time.Time{}
}

func IsDraining() bool {
	current.mu.RLock()
	defer current.mu.RUnlock()
	return current.draining
}

type Snapshot struct {
	Draining  bool      `json:"draining"`
	Message   string    `json:"message,omitempty"`
	StartedAt time.Time `json:"started_at,omitempty"`
}

func SnapshotState() Snapshot {
	current.mu.RLock()
	defer current.mu.RUnlock()
	return Snapshot{Draining: current.draining, Message: current.message, StartedAt: current.startedAt}
}
