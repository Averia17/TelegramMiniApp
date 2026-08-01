package game

import (
	"math"
	"testing"
)

func TestQuantizeAttackAngleKeepsThirtyTwoDirections(t *testing.T) {
	step := 2 * math.Pi / attackDirectionSectors
	seen := make(map[float64]struct{}, attackDirectionSectors)
	for index := 0; index < attackDirectionSectors; index++ {
		seen[quantizeAttackAngle(float64(index)*step+step*.18)] = struct{}{}
	}
	if len(seen) != attackDirectionSectors {
		t.Fatalf("got %d attack directions, want %d", len(seen), attackDirectionSectors)
	}
	if got := quantizeAttackAngle(-step * .18); math.Abs(got) > 1e-9 {
		t.Fatalf("near-zero attack angle = %.8f, want 0", got)
	}
}
