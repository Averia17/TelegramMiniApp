package gamemap

import "testing"

func TestTmpGateDebug(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleNorthernSeed)
	for _, wall := range mapValue.Collisions {
		if wall.Type == "fortress_wall" {
			x, y := int(wall.MinX/40), int(wall.MinY/40)
			if y >= 45 && y <= 55 && x >= 12 && x <= 38 {
				t.Logf("wall %d,%d", x, y)
			}
		}
	}
	for _, feature := range mapValue.Features {
		if feature.Type == "castle_gate" {
			t.Logf("gate %s %.2f %.2f", feature.ID, feature.X/40, feature.Y/40)
		}
	}
}
