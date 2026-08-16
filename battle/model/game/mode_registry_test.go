package game

import "testing"

type testRules struct{}

func (testRules) Mode() GameMode                                  { return "capture-the-flag" }
func (testRules) AssignTeams(*GameState)                          {}
func (testRules) EvaluateWinner(*GameState, int64) (string, bool) { return "", false }
func (testRules) TimeoutWinner(*GameState) string                 { return "" }

func TestMatchRulesRegistryAllowsAdditiveModes(t *testing.T) {
	registry := NewMatchRulesRegistry()
	registry.Register("capture-the-flag", func() MatchRules { return testRules{} })
	if got := registry.Resolve("capture-the-flag").Mode(); got != "capture-the-flag" {
		t.Fatalf("custom mode was not resolved: %q", got)
	}
}
