package game

// recordBotTargetSelection observes target changes without mutating the
// perception memory. Callers invoke it before rememberBotTarget updates that
// memory, so the metric reflects actual decision changes.
func (gs *GameState) recordBotTargetSelection(id string, target *botTarget) {
	if gs == nil || id == "" || target == nil {
		return
	}
	memory := gs.BotMemory[id]
	if memory == nil || memory.TargetID == "" {
		return
	}
	if memory.TargetType != target.kind || memory.TargetID != target.id {
		gs.botMetrics.TargetSwitches++
	}
}
