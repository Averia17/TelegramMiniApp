import test from "node:test"
import assert from "node:assert/strict"

import {getHeroCombatMarker} from "../src/components/BattleGame/rendering/heroes/healthBadge.js"

test("Mandy exposes a ready Focus marker before the empowered strike", () => {
  assert.deepEqual(getHeroCombatMarker({hero: "Mandy", focusCharge: 100}), {
    id: "focus",
    label: "ФОКУС",
    color: "#ffe255",
    filled: 3,
  })
})

test("Fairy Mina exposes a target mark before detonation", () => {
  assert.deepEqual(getHeroCombatMarker({hero: "Fairy Mina", marks: 1}), {
    id: "minaMark",
    label: "МЕТКА",
    color: "#ff9bea",
    filled: 1,
  })
})

test("combat marker stays hidden when no payoff is armed", () => {
  assert.equal(getHeroCombatMarker({hero: "Needle", focusCharge: 40, marks: 0}), null)
})

test("Wukong exposes accumulated rage before the vortex payoff", () => {
  assert.deepEqual(getHeroCombatMarker({hero: "Wukong Mico", micoRage: 5}), {
    id: "micoRage",
    label: "ЯРОСТЬ 5/5",
    color: "#ffb33e",
    filled: 3,
  })
})

test("Lumi exposes planted flowers before the burst payoff", () => {
  assert.deepEqual(getHeroCombatMarker({hero: "Persephone Lumi", lumiFlowers: 2}), {
    id: "lumiFlowers",
    label: "ЦВЕТЫ 2/5",
    color: "#f07bd0",
    filled: 2,
  })
})

test("Brock exposes an armed beam before the piercing shot", () => {
  assert.deepEqual(getHeroCombatMarker({hero: "Brock Zeus", gadgetArmed: true}), {
    id: "zeusBeam",
    label: "ЛУЧ ГОТОВ",
    color: "#9eeaff",
    filled: 3,
  })
})
