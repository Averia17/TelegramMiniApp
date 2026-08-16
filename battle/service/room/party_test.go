package room

import (
	"testing"
)

func TestPartyRegistryKeepsMembersTogetherAndReportsCapacity(t *testing.T) {
	registry := NewPartyRegistry()

	first, err := registry.Join("party-a", "player-1", 3)
	if err != nil {
		t.Fatalf("first join: %v", err)
	}
	if first.Count != 1 || first.MaxSize != 3 || first.OwnerID != "player-1" {
		t.Fatalf("unexpected first snapshot: %+v", first)
	}

	second, err := registry.Join("party-a", "player-2", 3)
	if err != nil {
		t.Fatalf("second join: %v", err)
	}
	if second.Count != 2 || second.MemberIDs[0] != "player-1" || second.MemberIDs[1] != "player-2" {
		t.Fatalf("unexpected second snapshot: %+v", second)
	}

	third, err := registry.Join("party-a", "player-3", 3)
	if err != nil || third.Count != 3 {
		t.Fatalf("third join = %+v, %v", third, err)
	}
	if _, err := registry.Join("party-a", "player-4", 3); err != ErrPartyFull {
		t.Fatalf("fourth join error = %v, want ErrPartyFull", err)
	}
}

func TestPartyRegistryRejectsConflictingMembershipAndAllowsLeave(t *testing.T) {
	registry := NewPartyRegistry()
	if _, err := registry.Join("party-a", "player-1", 3); err != nil {
		t.Fatal(err)
	}
	if _, err := registry.Join("party-b", "player-1", 3); err != ErrAlreadyInParty {
		t.Fatalf("conflicting join error = %v, want ErrAlreadyInParty", err)
	}

	registry.Leave("player-1")
	if _, err := registry.Join("party-b", "player-1", 3); err != nil {
		t.Fatalf("join after leave: %v", err)
	}
	if snapshot, ok := registry.Snapshot("party-a"); ok || snapshot.Count != 0 {
		t.Fatalf("empty party should be removed, got %+v, %v", snapshot, ok)
	}
}

func TestPartyRegistryUsesFirstPartyCapacity(t *testing.T) {
	registry := NewPartyRegistry()
	if _, err := registry.Join("party-a", "player-1", 2); err != nil {
		t.Fatal(err)
	}
	if _, err := registry.Join("party-a", "player-2", 3); err != nil {
		t.Fatal(err)
	}
	if _, err := registry.Join("party-a", "player-3", 3); err != ErrPartyFull {
		t.Fatalf("capacity override error = %v, want ErrPartyFull", err)
	}
}
