import test from "node:test"
import assert from "node:assert/strict"

import {COMBAT_AUDIO_BUS_DB, CombatAudio, dbToGain, getCombatAudioCue} from "../src/components/BattleGame/rendering/combat/combatAudio.js"

test("combat audio routes routine, ability and defeat hits to distinct tiers", () => {
  assert.equal(getCombatAudioCue({kind: "damage"}), null)
  assert.equal(getCombatAudioCue({kind: "hit", accepted: true, resolved: true, abilitySlot: "basic"}).bus, "hit")
  assert.equal(getCombatAudioCue({kind: "hit", accepted: true, resolved: true, abilitySlot: "super"}).bus, "ability")
  assert.equal(getCombatAudioCue({kind: "hit", accepted: true, resolved: true, reaction: "defeat", abilitySlot: "basic"}).priority, 3)
})

test("combat audio exposes decibel buses and fails safely without WebAudio", () => {
  assert.ok(dbToGain(COMBAT_AUDIO_BUS_DB.master) > 0)
  const audio = new CombatAudio({contextFactory: () => null})
  assert.equal(audio.playCombatEvent({kind: "hit", accepted: true, resolved: true, abilitySlot: "basic"}), false)
  audio.dispose()
})
