package game

import "testing"

func TestBotMLRuntimeConfigDefaultsToDisabledAndRejectsMissingCheckpoint(t *testing.T) {
	t.Setenv("BOT_ML_MODE", "")
	t.Setenv("BOT_ML_CHECKPOINT", "")
	config := BotMLRuntimeConfigFromEnv()
	if config.Mode != BotMLRuntimeDisabled {
		t.Fatalf("default ML mode=%q want disabled", config.Mode)
	}
	state := newTestGameState()
	if err := state.ConfigureBotMLRuntime(config); err != nil {
		t.Fatalf("disabled ML runtime should be valid: %v", err)
	}
	t.Setenv("BOT_ML_MODE", "active")
	if err := state.ConfigureBotMLRuntime(BotMLRuntimeConfigFromEnv()); err == nil {
		t.Fatal("active ML runtime accepted an empty checkpoint path")
	}
}

func TestBotMLRuntimeConfigRejectsUnknownMode(t *testing.T) {
	state := newTestGameState()
	if err := state.ConfigureBotMLRuntime(BotMLRuntimeConfig{Mode: "experimental"}); err == nil {
		t.Fatal("unknown ML runtime mode was accepted")
	}
}
