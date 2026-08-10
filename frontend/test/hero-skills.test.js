import test from "node:test"
import assert from "node:assert/strict"
import {HERO_SKILLS, getHeroSkill} from "../src/components/BattleGame/heroSkills.js"

const heroes = [
  "Needle", "Mandy", "Fairy Mina", "Brock Zeus",
  "Kaze", "Wukong Mico", "Persephone Lumi",
  "Katty",
]

test("every selectable hero has a named super and gadget", () => {
  assert.deepEqual(Object.keys(HERO_SKILLS).sort(), heroes.sort())
  for (const hero of heroes) {
    for (const slot of ["primary", "secondary"]) {
      const skill = getHeroSkill(hero, slot)
      assert.ok(skill.name.length >= 4, `${hero} ${slot} has no name`)
      assert.ok(skill.description.length >= 12, `${hero} ${slot} has no description`)
      assert.match(skill.effect, /^[a-z][a-z0-9_]+$/)
    }
  }
})

test("unknown heroes receive safe localized fallback skills", () => {
  assert.equal(getHeroSkill("Unknown", "primary").name, "СУПЕР")
  assert.equal(getHeroSkill("Unknown", "secondary").name, "ГАДЖЕТ")
})

test("known hero HUD skills use the authoritative kit contract", () => {
  assert.equal(getHeroSkill("Needle", "primary").name, "Ловчий корень")
  assert.equal(getHeroSkill("Needle", "secondary").name, "Споровый рывок")
  assert.equal(getHeroSkill("Wukong Mico", "primary").name, "Вихрь возмездия")
})
