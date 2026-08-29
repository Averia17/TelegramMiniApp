package deployment

import "testing"

func TestDrainStateIsIdempotentAndResumable(t *testing.T) {
	Resume()
	if !Begin("maintenance") {
		t.Fatal("first drain request should begin")
	}
	if Begin("second") {
		t.Fatal("second drain request should be idempotent")
	}
	snapshot := SnapshotState()
	if !snapshot.Draining || snapshot.Message != "maintenance" || snapshot.StartedAt.IsZero() {
		t.Fatalf("unexpected drain snapshot: %+v", snapshot)
	}
	Resume()
	if IsDraining() {
		t.Fatal("resume should clear the drain flag")
	}
}
