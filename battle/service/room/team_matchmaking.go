package room

import "sort"

// MatchMember is the minimum immutable identity needed during team formation.
// A party is never split between teams.
type MatchMember struct {
	ID   string
	Hero string
}

type MatchUnit struct {
	PartyID string
	Members []MatchMember
}

// FormTeamAssignments creates two balanced teams without repeating a hero
// inside either team. It uses backtracking because the lobby is intentionally
// small and this keeps the rule correct for arbitrary party sizes.
func FormTeamAssignments(units []MatchUnit, teamSize int) (map[string]string, bool) {
	if teamSize <= 0 || len(units) == 0 {
		return nil, false
	}
	units = append([]MatchUnit(nil), units...)
	for i := range units {
		if len(units[i].Members) == 0 || len(units[i].Members) > teamSize || !unitHasUniqueHeroes(units[i]) {
			return nil, false
		}
	}
	sort.Slice(units, func(i, j int) bool {
		if len(units[i].Members) != len(units[j].Members) {
			return len(units[i].Members) > len(units[j].Members)
		}
		return units[i].PartyID < units[j].PartyID
	})
	sort.Slice(units, func(i, j int) bool {
		if len(units[i].Members) != len(units[j].Members) {
			return len(units[i].Members) > len(units[j].Members)
		}
		return units[i].PartyID < units[j].PartyID
	})

	teams := []struct {
		name   string
		count  int
		heroes map[string]bool
	}{
		{name: "Blue", heroes: map[string]bool{}},
		{name: "Red", heroes: map[string]bool{}},
	}
	result := make(map[string]string)
	var place func(int) bool
	place = func(index int) bool {
		if index == len(units) {
			return teams[0].count == teamSize && teams[1].count == teamSize
		}
		unit := units[index]
		for teamIndex := range teams {
			team := &teams[teamIndex]
			if team.count+len(unit.Members) > teamSize || !heroesFit(team.heroes, unit.Members) {
				continue
			}
			team.count += len(unit.Members)
			for _, member := range unit.Members {
				team.heroes[member.Hero] = true
				result[member.ID] = team.name
			}
			if place(index + 1) {
				return true
			}
			team.count -= len(unit.Members)
			for _, member := range unit.Members {
				delete(team.heroes, member.Hero)
				delete(result, member.ID)
			}
		}
		return false
	}
	if !place(0) {
		return nil, false
	}
	return result, true
}

// FormPartialTeamAssignments is used when matchmaking starts with fewer than
// six humans and the game will fill the remaining slots with bots. It keeps
// parties together and still prevents duplicate heroes inside a team.
func FormPartialTeamAssignments(units []MatchUnit, teamSize int) (map[string]string, bool) {
	if teamSize <= 0 || len(units) == 0 {
		return nil, false
	}
	units = append([]MatchUnit(nil), units...)
	for i := range units {
		if len(units[i].Members) == 0 || len(units[i].Members) > teamSize || !unitHasUniqueHeroes(units[i]) {
			return nil, false
		}
	}
	teams := []struct {
		name   string
		count  int
		heroes map[string]bool
	}{{name: "Blue", heroes: map[string]bool{}}, {name: "Red", heroes: map[string]bool{}}}
	result := make(map[string]string)
	best := map[string]string(nil)
	bestDifference := teamSize*2 + 1
	var place func(int) bool
	place = func(index int) bool {
		if index == len(units) {
			difference := teams[0].count - teams[1].count
			if difference < 0 {
				difference = -difference
			}
			if best == nil || difference < bestDifference {
				bestDifference = difference
				best = make(map[string]string, len(result))
				for id, team := range result {
					best[id] = team
				}
			}
			return false
		}
		unit := units[index]
		for teamIndex := range teams {
			team := &teams[teamIndex]
			if team.count+len(unit.Members) > teamSize || !heroesFit(team.heroes, unit.Members) {
				continue
			}
			team.count += len(unit.Members)
			for _, member := range unit.Members {
				team.heroes[member.Hero] = true
				result[member.ID] = team.name
			}
			place(index + 1)
			team.count -= len(unit.Members)
			for _, member := range unit.Members {
				delete(team.heroes, member.Hero)
				delete(result, member.ID)
			}
		}
		return false
	}
	place(0)
	if best == nil {
		return nil, false
	}
	return best, true
}

func unitHasUniqueHeroes(unit MatchUnit) bool {
	seen := map[string]bool{}
	for _, member := range unit.Members {
		if member.ID == "" || member.Hero == "" || seen[member.Hero] {
			return false
		}
		seen[member.Hero] = true
	}
	return true
}

func heroesFit(seen map[string]bool, members []MatchMember) bool {
	for _, member := range members {
		if seen[member.Hero] {
			return false
		}
	}
	return true
}
