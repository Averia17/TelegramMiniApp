package room

import "testing"

func TestFormTeamAssignmentsKeepsPartiesTogetherAndHeroesUnique(t *testing.T) {
	units := []MatchUnit{
		{PartyID: "party-a", Members: []MatchMember{{ID: "a1", Hero: "Needle"}, {ID: "a2", Hero: "Kaze"}}},
		{PartyID: "party-b", Members: []MatchMember{{ID: "b1", Hero: "Needle"}}},
		{PartyID: "party-c", Members: []MatchMember{{ID: "c1", Hero: "Mandy"}}},
		{PartyID: "party-d", Members: []MatchMember{{ID: "d1", Hero: "Kaze"}}},
		{PartyID: "party-e", Members: []MatchMember{{ID: "e1", Hero: "Mina"}}},
	}

	assignments, ok := FormTeamAssignments(units, 3)
	if !ok {
		t.Fatal("expected six players to form two teams")
	}
	if len(assignments) != 6 {
		t.Fatalf("assignments = %d, want 6", len(assignments))
	}

	for _, id := range []string{"a1", "a2"} {
		if assignments[id] != assignments["a1"] {
			t.Fatalf("party-a was split: %+v", assignments)
		}
	}
	seen := map[string]map[string]bool{"Blue": {}, "Red": {}}
	counts := map[string]int{}
	for _, unit := range units {
		for _, member := range unit.Members {
			team := assignments[member.ID]
			counts[team]++
			if seen[team][member.Hero] {
				t.Fatalf("hero %q repeated in %s", member.Hero, team)
			}
			seen[team][member.Hero] = true
		}
	}
	if counts["Blue"] != 3 || counts["Red"] != 3 {
		t.Fatalf("team counts = %+v, want 3/3", counts)
	}
}

func TestFormTeamAssignmentsRejectsIncompleteOrOversizedParties(t *testing.T) {
	if _, ok := FormTeamAssignments([]MatchUnit{
		{PartyID: "party-a", Members: []MatchMember{{ID: "a1", Hero: "Needle"}, {ID: "a2", Hero: "Kaze"}}},
		{PartyID: "party-b", Members: []MatchMember{{ID: "b1", Hero: "Mandy"}}},
	}, 3); ok {
		t.Fatal("incomplete lobby should not start")
	}
	if _, ok := FormTeamAssignments([]MatchUnit{
		{PartyID: "party-a", Members: []MatchMember{{ID: "a1", Hero: "Needle"}, {ID: "a2", Hero: "Needle"}, {ID: "a3", Hero: "Kaze"}, {ID: "a4", Hero: "Mina"}}},
		{PartyID: "party-b", Members: []MatchMember{{ID: "b1", Hero: "Mandy"}, {ID: "b2", Hero: "Kaze"}}},
	}, 3); ok {
		t.Fatal("party larger than team capacity should not start")
	}
}

func TestFormPartialTeamAssignmentsKeepsSoloSearchPlayable(t *testing.T) {
	assignments, ok := FormPartialTeamAssignments([]MatchUnit{{PartyID: "solo", Members: []MatchMember{{ID: "p1", Hero: "Viper"}}}}, 3)
	if !ok || assignments["p1"] == "" {
		t.Fatalf("assignments = %#v, ok=%v", assignments, ok)
	}
}

func TestFormPartialTeamAssignmentsKeepsThreePlayerPartyTogether(t *testing.T) {
	assignments, ok := FormPartialTeamAssignments([]MatchUnit{{PartyID: "party", Members: []MatchMember{{ID: "p1", Hero: "Viper"}, {ID: "p2", Hero: "Needle"}, {ID: "p3", Hero: "Mico"}}}}, 3)
	if !ok || assignments["p1"] != assignments["p2"] || assignments["p2"] != assignments["p3"] {
		t.Fatalf("assignments = %#v, ok=%v", assignments, ok)
	}
}

func TestFormPartialTeamAssignmentsBalancesSoloPlayers(t *testing.T) {
	units := []MatchUnit{
		{PartyID: "solo-a", Members: []MatchMember{{ID: "a", Hero: "Viper"}}},
		{PartyID: "solo-b", Members: []MatchMember{{ID: "b", Hero: "Needle"}}},
	}
	assignments, ok := FormPartialTeamAssignments(units, 3)
	if !ok || assignments["a"] == assignments["b"] {
		t.Fatalf("assignments = %#v, want one solo player per team", assignments)
	}
}

func TestFormPartialTeamAssignmentsKeepsThreePlayersAsBalancedAsPossible(t *testing.T) {
	units := []MatchUnit{
		{PartyID: "solo-a", Members: []MatchMember{{ID: "a", Hero: "Viper"}}},
		{PartyID: "solo-b", Members: []MatchMember{{ID: "b", Hero: "Needle"}}},
		{PartyID: "solo-c", Members: []MatchMember{{ID: "c", Hero: "Mandy"}}},
	}
	assignments, ok := FormPartialTeamAssignments(units, 3)
	if !ok {
		t.Fatal("expected three solo players to be assigned")
	}
	counts := map[string]int{}
	for _, team := range assignments {
		counts[team]++
	}
	if counts["Blue"] != 2 || counts["Red"] != 1 {
		t.Fatalf("team counts = %#v, want 2/1", counts)
	}
}

func TestSwapTeamAssignmentSidesPreservesRosterAndSwapsBases(t *testing.T) {
	assignments := map[string]string{
		"player-1": "Blue",
		"player-2": "Blue",
		"player-3": "Red",
	}

	swapTeamAssignmentSides(assignments)

	if assignments["player-1"] != "Red" || assignments["player-2"] != "Red" || assignments["player-3"] != "Blue" {
		t.Fatalf("assignments after side swap = %#v, want Blue/Red exchanged", assignments)
	}
}
