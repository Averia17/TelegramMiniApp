package deployment

import "testing"

func TestDrainStateIsIdempotent(t *testing.T) {
	Resume()
	if !Begin("maintenance") {
		t.Fatal("first begin should change state")
	}
	if Begin("maintenance") {
		t.Fatal("second begin should be idempotent")
	}
	if !IsDraining() || SnapshotState().Message != "maintenance" {
		t.Fatal("drain state was not retained")
	}
	Resume()
	if IsDraining() {
		t.Fatal("resume did not clear state")
	}
}
