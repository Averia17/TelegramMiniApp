package room

import (
	"testing"
	"time"
)

func TestStateSnapshotsUseEverySimulationFrame(t *testing.T) {
	if !shouldPublishState(1) || !shouldPublishState(2) || !shouldPublishState(3) {
		t.Fatal("every simulation frame should publish a snapshot")
	}
}

func TestBattleTickElapsedUsesThePreviousTickTimestamp(t *testing.T) {
	previous := time.UnixMilli(1_000)
	current := time.UnixMilli(1_100)

	if elapsed := battleTickElapsed(previous, current); elapsed != 100*time.Millisecond {
		t.Fatalf("elapsed = %s, want 100ms", elapsed)
	}
	if elapsed := battleTickElapsed(time.Time{}, current); elapsed != nominalTickDuration {
		t.Fatalf("first tick elapsed = %s, want %s", elapsed, nominalTickDuration)
	}
}
