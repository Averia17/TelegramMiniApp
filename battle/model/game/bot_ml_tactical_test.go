package game

import "testing"

func TestBotMLTacticalObservationUsesStableVisibleTargetSlots(t *testing.T) {
	state := newTestGameState()
	state.Walls = nil
	state.Props = nil
	state.State = GameStateGame
	state.PlayerAdd("bot", "Bot", "Needle")
	state.PlayerAdd("enemy-a", "Enemy A", "Kaze")
	state.PlayerAdd("enemy-b", "Enemy B", "Mandy")

	bot := state.Players["bot"]
	bot.IsBot = true
	bot.X, bot.Y = 100, 100
	state.Players["enemy-a"].X, state.Players["enemy-a"].Y = 320, 100
	state.Players["enemy-b"].X, state.Players["enemy-b"].Y = 220, 100

	first, err := state.BotMLTacticalObservationFor("bot", 10_000)
	if err != nil {
		t.Fatalf("first tactical observation: %v", err)
	}
	state.Players["enemy-a"], state.Players["enemy-b"] = state.Players["enemy-b"], state.Players["enemy-a"]
	second, err := state.BotMLTacticalObservationFor("bot", 10_000)
	if err != nil {
		t.Fatalf("second tactical observation: %v", err)
	}
	if first.SchemaVersion != BotMLTacticalSchemaVersion || len(first.Values) != BotMLTacticalObservationSize {
		t.Fatalf("unexpected tactical schema: %#v", first)
	}
	for index := range first.Values {
		if first.Values[index] != second.Values[index] {
			t.Fatalf("target slot feature %d changed with map insertion order: %.4f != %.4f", index, first.Values[index], second.Values[index])
		}
	}
}

func TestBotMLTacticalObservationMasksUnavailableTargetAndAbilityChoices(t *testing.T) {
	state := newTestGameState()
	state.Walls = nil
	state.Props = nil
	state.State = GameStateGame
	state.PlayerAdd("bot", "Bot", "Needle")
	state.Players["bot"].IsBot = true
	state.Players["bot"].GadgetCharges = 0

	observation, err := state.BotMLTacticalObservationFor("bot", 10_000)
	if err != nil {
		t.Fatalf("tactical observation: %v", err)
	}
	if len(observation.TargetMask) != int(BotMLTacticalTargetCount) || observation.TargetMask[BotMLTacticalTargetEnemy0] {
		t.Fatalf("unavailable enemy target was not masked: %#v", observation.TargetMask)
	}
	if observation.AbilityMask[BotMLTacticalAbilityGadget] || observation.AbilityMask[BotMLTacticalAbilitySuper] {
		t.Fatalf("unready abilities were not masked: %#v", observation.AbilityMask)
	}
	if !observation.IntentMask[BotMLTacticalIntentRoam] || !observation.MovementMask[BotMLTacticalMovementDirect] {
		t.Fatalf("basic tactical choices were masked: intent=%#v movement=%#v", observation.IntentMask, observation.MovementMask)
	}
}
