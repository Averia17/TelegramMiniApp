package game

import (
	"fmt"
	"os"
	"strings"
)

type BotMLRuntimeMode string

const (
	BotMLRuntimeDisabled BotMLRuntimeMode = "disabled"
	BotMLRuntimeShadow   BotMLRuntimeMode = "shadow"
	BotMLRuntimeActive   BotMLRuntimeMode = "active"
)

type BotMLRuntimeConfig struct {
	Mode           BotMLRuntimeMode
	CheckpointPath string
	ActiveApproved bool
}

type BotMLTacticalRuntimeConfig struct {
	Mode           BotMLRuntimeMode
	CheckpointPath string
	ActiveApproved bool
	Direct         bool
}

func BotMLRuntimeConfigFromEnv() BotMLRuntimeConfig {
	mode := BotMLRuntimeMode(strings.ToLower(strings.TrimSpace(os.Getenv("BOT_ML_MODE"))))
	if mode == "" {
		mode = BotMLRuntimeDisabled
	}
	approved := strings.EqualFold(strings.TrimSpace(os.Getenv("BOT_ML_ACTIVE_APPROVED")), "true")
	return BotMLRuntimeConfig{Mode: mode, CheckpointPath: strings.TrimSpace(os.Getenv("BOT_ML_CHECKPOINT")), ActiveApproved: approved}
}

func BotMLTacticalRuntimeConfigFromEnv() BotMLTacticalRuntimeConfig {
	mode := BotMLRuntimeMode(strings.ToLower(strings.TrimSpace(os.Getenv("BOT_ML_TACTICAL_MODE"))))
	if mode == "" {
		mode = BotMLRuntimeDisabled
	}
	approved := strings.EqualFold(strings.TrimSpace(os.Getenv("BOT_ML_TACTICAL_ACTIVE_APPROVED")), "true")
	direct := strings.EqualFold(strings.TrimSpace(os.Getenv("BOT_ML_TACTICAL_DIRECT")), "true")
	return BotMLTacticalRuntimeConfig{Mode: mode, CheckpointPath: strings.TrimSpace(os.Getenv("BOT_ML_TACTICAL_CHECKPOINT")), ActiveApproved: approved, Direct: direct}
}

// ConfigureBotMLRuntime applies the explicit, opt-in runtime mode. Any load
// or compatibility error leaves the state on deterministic utility AI.
func (gs *GameState) ConfigureBotMLRuntime(config BotMLRuntimeConfig) error {
	if gs == nil {
		return fmt.Errorf("ML runtime requires a game state")
	}
	mode := BotMLRuntimeMode(strings.ToLower(strings.TrimSpace(string(config.Mode))))
	if mode == "" {
		mode = BotMLRuntimeDisabled
	}
	gs.botMLPolicy = nil
	gs.botMLShadowPolicy = nil
	if mode == BotMLRuntimeDisabled {
		return nil
	}
	if mode != BotMLRuntimeShadow && mode != BotMLRuntimeActive {
		return fmt.Errorf("unknown ML runtime mode %q", config.Mode)
	}
	if mode == BotMLRuntimeActive && !config.ActiveApproved {
		return fmt.Errorf("active ML runtime requires BOT_ML_ACTIVE_APPROVED=true")
	}
	if config.CheckpointPath == "" {
		return fmt.Errorf("ML runtime mode %q requires BOT_ML_CHECKPOINT", mode)
	}
	policy, err := LoadBotMLRecurrentPolicy(config.CheckpointPath)
	if err != nil {
		return fmt.Errorf("load ML runtime checkpoint: %w", err)
	}
	if mode == BotMLRuntimeShadow {
		gs.botMLShadowPolicy = policy
	} else {
		gs.botMLPolicy = policy
	}
	return nil
}

// ConfigureBotMLTacticalRuntime is deliberately separate from v1 so an
// invalid v2 artifact can never silently replace the proven fallback policy.
func (gs *GameState) ConfigureBotMLTacticalRuntime(config BotMLTacticalRuntimeConfig) error {
	if gs == nil {
		return fmt.Errorf("tactical ML runtime requires a game state")
	}
	gs.botMLTacticalPolicy = nil
	gs.botMLTacticalDirect = false
	mode := BotMLRuntimeMode(strings.ToLower(strings.TrimSpace(string(config.Mode))))
	if mode == "" || mode == BotMLRuntimeDisabled {
		return nil
	}
	if mode != BotMLRuntimeActive {
		return fmt.Errorf("unsupported tactical ML runtime mode %q", config.Mode)
	}
	if !config.ActiveApproved {
		return fmt.Errorf("active tactical ML runtime requires BOT_ML_TACTICAL_ACTIVE_APPROVED=true")
	}
	if config.CheckpointPath == "" {
		return fmt.Errorf("active tactical ML runtime requires BOT_ML_TACTICAL_CHECKPOINT")
	}
	policy, err := LoadBotMLTacticalPolicy(config.CheckpointPath)
	if err != nil {
		return fmt.Errorf("load tactical ML runtime checkpoint: %w", err)
	}
	gs.botMLTacticalPolicy = policy
	gs.botMLTacticalDirect = config.Direct
	return nil
}
