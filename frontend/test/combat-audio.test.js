import test from "node:test"
import assert from "node:assert/strict"

import {COMBAT_AUDIO_BUS_DB, CombatAudio, dbToGain, getCombatAudioCue, getCombatEffectCue} from "../src/components/BattleGame/rendering/combat/combatAudio.js"

test("combat audio routes routine, ability and defeat hits to distinct tiers", () => {
  assert.equal(getCombatAudioCue({kind: "damage"}), null)
  assert.equal(getCombatAudioCue({kind: "hit", accepted: true, resolved: true, abilitySlot: "basic"}).bus, "hit")
  assert.equal(getCombatAudioCue({kind: "hit", accepted: true, resolved: true, abilitySlot: "super"}).bus, "ability")
  assert.equal(getCombatAudioCue({kind: "hit", accepted: true, resolved: true, reaction: "defeat", abilitySlot: "basic"}).priority, 3)
})

test("combat audio gives an accepted ability its own cast cue", () => {
  const cue = getCombatAudioCue({kind: "ability", reason: "accepted", accepted: true, resolved: true})
  assert.equal(cue.bus, "ability")
  assert.equal(cue.priority, 2)
  assert.equal(getCombatAudioCue({kind: "ability", reason: "ability_missed", accepted: false, resolved: true}), null)
})

test("combat audio exposes decibel buses and fails safely without WebAudio", () => {
  assert.ok(dbToGain(COMBAT_AUDIO_BUS_DB.master) > 0)
  const audio = new CombatAudio({contextFactory: () => null})
  assert.equal(audio.playCombatEvent({kind: "hit", accepted: true, resolved: true, abilitySlot: "basic"}), false)
  audio.dispose()
})

test("combat audio gives readable danger telegraphs their own bus and priority", () => {
  const cue = getCombatEffectCue({id: "danger-1", kind: "root_guardian_telegraph"})
  assert.equal(cue.bus, "danger")
  assert.ok(cue.priority > 1)
  assert.equal(getCombatEffectCue({kind: "root_guardian_zone"}), null)
})

test("combat audio deduplicates the same danger effect id", () => {
  const gainNode = () => ({
    gain: {value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}},
    connect() {},
  })
  const context = {
    currentTime: 0,
    state: "running",
    destination: {},
    createGain: gainNode,
    createOscillator: () => ({
      type: "sine",
      frequency: {setValueAtTime() {}, exponentialRampToValueAtTime() {}},
      connect() {},
      start() {},
      stop() {},
    }),
    close() {},
  }
  const audio = new CombatAudio({contextFactory: () => context})
  const effect = {id: "danger-1", kind: "ash_hound_charge_telegraph"}
  assert.equal(audio.playCombatEffect(effect), true)
  assert.equal(audio.playCombatEffect(effect), false)
  audio.dispose()
})

test("combat audio deduplicates authoritative ability events across snapshots", () => {
  const gainNode = () => ({
    gain: {value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}},
    connect() {},
  })
  const context = {
    currentTime: 0,
    state: "running",
    destination: {},
    createGain: gainNode,
    createOscillator: () => ({
      type: "sine",
      frequency: {setValueAtTime() {}, exponentialRampToValueAtTime() {}},
      connect() {},
      start() {},
      stop() {},
    }),
    close() {},
  }
  const audio = new CombatAudio({contextFactory: () => context})
  const event = {id: 7, kind: "ability", reason: "accepted", accepted: true, resolved: true}
  assert.equal(audio.syncEvents([event]), 1)
  assert.equal(audio.syncEvents([event]), 0)
  audio.dispose()
})
