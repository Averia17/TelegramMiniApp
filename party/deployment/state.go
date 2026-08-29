package deployment

import "sync"

var state struct {
	sync.RWMutex
	draining bool
	message  string
}

type Snapshot struct {
	Draining bool   `json:"draining"`
	Message  string `json:"message"`
}

func Begin(message string) bool {
	state.Lock()
	deferred := state.draining
	state.draining = true
	state.message = message
	state.Unlock()
	return !deferred
}

func Resume() {
	state.Lock()
	state.draining = false
	state.message = ""
	state.Unlock()
}

func IsDraining() bool {
	state.RLock()
	defer state.RUnlock()
	return state.draining
}

func SnapshotState() Snapshot {
	state.RLock()
	defer state.RUnlock()
	return Snapshot{Draining: state.draining, Message: state.message}
}
