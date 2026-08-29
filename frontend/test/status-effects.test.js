import test from "node:test"
import assert from "node:assert/strict"

import {getActiveStatusEffects} from "../src/components/BattleGame/statusEffects.js"

test("shows bush concealment as an active effect", () => {
  const effects = getActiveStatusEffects({lives: 3}, {inBush: true})

  assert.deepEqual(effects.map(effect => effect.id), ["bush"])
  assert.equal(effects[0].label, "СПРЯТАН В КУСТАХ")
  assert.equal(effects[0].remaining, null)
})

test("shows crowd-control effects with their remaining duration", () => {
  const effects = getActiveStatusEffects({stun: 1.25, slow: 2.5}, {inBush: false})

  assert.deepEqual(effects.map(effect => effect.id), ["stun", "slow"])
  assert.equal(effects[0].remaining, 1.25)
  assert.equal(effects[1].remaining, 2.5)
})

test("labels team spawn protection clearly and keeps its countdown", () => {
  const effects = getActiveStatusEffects({lives: 3, invulnerable: 2.4})

  assert.deepEqual(effects.map(effect => [effect.id, effect.label, effect.remaining]), [
    ["invulnerable", "ЗАЩИТА РЕСПАВНА", 2.4],
  ])
})

test("does not show expired or inactive effects", () => {
  const effects = getActiveStatusEffects({stun: 0, poisoned: false, lunarShield: false}, {inBush: false})

  assert.deepEqual(effects, [])
})

test("does not show a timed effect that would render as zero seconds", () => {
  const effects = getActiveStatusEffects({shield: 0.04, slow: 0.049}, {inBush: false})

  assert.deepEqual(effects, [])
})

test("shows passable vine terrain as a visible slowdown effect", () => {
  const effects = getActiveStatusEffects({terrainMultiplier: 0.68})

  assert.deepEqual(effects.map(effect => [effect.id, effect.label, effect.icon, effect.remaining]), [
    ["vineTerrain", "ЛОЗА: ЗАМЕДЛЕНИЕ", "🌿", null],
  ])
})

test("does not show ground slowdown while flying over vines", () => {
  const effects = getActiveStatusEffects({terrainMultiplier: 0.68, flying: 1.2})

  assert.equal(effects.some(effect => effect.id === "vineTerrain"), false)
  assert.equal(effects.some(effect => effect.id === "flying"), true)
})

test("keeps persistent effects visible without inventing a timer", () => {
  const effects = getActiveStatusEffects({poisoned: true, lunarShield: true}, {inBush: false})

  assert.deepEqual(effects.map(effect => [effect.id, effect.remaining]), [
    ["lunarShield", null],
    ["poisoned", null],
  ])
})

test("shows Wukong rage and Kaze combo progress", () => {
  const effects = getActiveStatusEffects({micoRage: 4, kazeCombo: 2})

  assert.deepEqual(effects.map(effect => [effect.id, effect.label]), [
    ["micoRage", "ЯРОСТЬ 4/5"],
    ["kazeCombo", "КОМБО 2/2"],
  ])
})

test("shows Lumi flower setup before the burst payoff", () => {
  const effects = getActiveStatusEffects({lumiFlowers: 3})

  assert.deepEqual(effects.map(effect => [effect.id, effect.label]), [["lumiFlowers", "ЦВЕТЫ 3/5"]])
})

test("does not expose the removed global Kaze vulnerability", () => {
  const effects = getActiveStatusEffects({doomed: 1.4})
  assert.equal(effects.some(effect => effect.id === "doomed"), false)
})

test("shows Mina light mark as a pending detonation", () => {
  const effects = getActiveStatusEffects({marks: 1})
  assert.deepEqual(effects.map(effect => effect.id), ["minaMark"])
  assert.equal(effects[0].remaining, null)
})

test("shows Needle anti-heal and spore stack counter", () => {
  const effects = getActiveStatusEffects({antiHeal: 1.4, sporeStacks: 2})

  assert.deepEqual(effects.map(effect => [effect.id, effect.label, effect.remaining]), [
    ["antiHeal", "АНТИХИЛ", 1.4],
    ["sporeStacks", "СПОРЫ 2/3", null],
  ])
})
