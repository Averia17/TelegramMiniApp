package game

import (
	"battle/model/player"
	"time"
)

type IslandVoiceTrigger string

const (
	IslandVoiceTriggerPhase     IslandVoiceTrigger = "phase"
	IslandVoiceTriggerKill      IslandVoiceTrigger = "first_kill"
	IslandVoiceTriggerLowHealth IslandVoiceTrigger = "low_health"
	IslandVoiceTriggerDuel      IslandVoiceTrigger = "duel"
)

const IslandVoiceCooldown = 12 * time.Second

func (gs *GameState) emitIslandVoice(playerID string, trigger IslandVoiceTrigger, now int64) {
	p := gs.Players[playerID]
	if p == nil || !p.IsAlive() || gs.SendToPlayer == nil {
		return
	}
	if gs.IslandVoiceNextAt == nil {
		gs.IslandVoiceNextAt = make(map[string]int64)
	}
	if nextAt := gs.IslandVoiceNextAt[playerID]; now < nextAt {
		return
	}
	text := islandVoiceText(p, trigger, gs.IslandPhase)
	if text == "" {
		return
	}
	gs.IslandVoiceNextAt[playerID] = now + IslandVoiceCooldown.Milliseconds()
	gs.SendToPlayer(playerID, "island_voice", map[string]interface{}{
		"name":    "Глас острова",
		"text":    text,
		"trigger": string(trigger),
		"hero":    p.HeroName,
		"phase":   string(gs.IslandPhase),
	})
}

func (gs *GameState) emitIslandVoiceToAll(trigger IslandVoiceTrigger, now int64) {
	for playerID := range gs.Players {
		gs.emitIslandVoice(playerID, trigger, now)
	}
}

func (gs *GameState) updateIslandVoices(now int64) {
	for _, p := range gs.Players {
		if p == nil || !p.IsAlive() || p.MaxLives <= 0 {
			continue
		}
		if p.Lives*4 <= p.MaxLives {
			gs.emitIslandVoice(p.PlayerId, IslandVoiceTriggerLowHealth, now)
		}
	}
}

func islandVoiceText(p *player.Player, trigger IslandVoiceTrigger, phase IslandPhase) string {
	switch trigger {
	case IslandVoiceTriggerPhase:
		switch phase {
		case IslandPhaseLanding:
			return "Корабль уходит. Остров уже знает, кто из вас боится."
		case IslandPhaseHunt:
			return "Теперь вы слышите друг друга. Найдите того, кто услышит последним."
		case IslandPhaseChallenge:
			return "Я меняю правила. Посмотрим, кто умеет жить по новым."
		case IslandPhaseCollapse:
			return "Берег исчезает. Идите к сердцу, пока оно не закрылось."
		case IslandPhaseBeacon:
			return "Маяк открыт. Один из вас вернётся другим."
		}
	case IslandVoiceTriggerKill:
		if p.HeroName == "Mandy" {
			return "Ты чувствуешь? Это вкус силы. Ещё?"
		}
		if p.HeroName == "Kaze" {
			return "Ещё один голос стих. Твоя метка стала тяжелее."
		}
		return "Я запомнил этот удар. Не заставляй меня просить ещё."
	case IslandVoiceTriggerLowHealth:
		if p.HeroName == "Persephone Lumi" {
			return "Ты уже была здесь. И снова уходишь последней."
		}
		return "Твоя боль ярче твоего имени. Не дай ей стать последним, что я запомню."
	case IslandVoiceTriggerDuel:
		return "Двое у сердца. Один станет моей памятью, второй — моей волей."
	}
	return ""
}
