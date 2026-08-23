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
  assert.equal(getHeroSkill("Needle", "secondary").name, "Споровый побег")
  assert.equal(getHeroSkill("Wukong Mico", "primary").name, "Вихрь возмездия")
})

test("Needle spore escape advertises its dash and stack payoff", () => {
  const description = getHeroSkill("Needle", "secondary").description
  assert.match(description, /рывок на 6 метров/i)
  assert.match(description, /третий стак/i)
})

test("Mandy Super explains its map-wide lane and mobile wind-up", () => {
  const description = getHeroSkill("Mandy", "primary").description
  assert.match(description, /через всю карту/i)
  assert.match(description, /оглушает.*1,2 секунды/i)
  assert.match(description, /может двигаться/i)
})

test("melee Supers advertise their follow-up control window", () => {
  for (const hero of ["Mandy", "Kaze", "Wukong Mico"]) {
    assert.match(getHeroSkill(hero, "primary").description, /оглушает.*(?:0,6 секунды|1 секунду|1,2 секунды)/i)
  }
})

test("Mandy Gadget describes an active counter-hit window", () => {
  const description = getHeroSkill("Mandy", "secondary").description
  assert.match(description, /1,8 секунды/i)
  assert.match(description, /50% больше урона/i)
  assert.doesNotMatch(description, /не может двигаться/i)
})

test("Mandy basic explains the immediate stun and focused payoff", () => {
  const description = getHeroSkill("Mandy", "basic").description
  assert.match(description, /100 урона/i)
  assert.match(description, /0,3 секунды/i)
  assert.match(description, /150/i)
  assert.match(description, /0,8 секунды/i)
})

test("reworked basic attacks describe their visible hit rules", () => {
  assert.match(getHeroSkill("Needle", "basic").description, /снижает лечение/i)
  assert.match(getHeroSkill("Brock Zeus", "basic").description, /не разрушает стены/i)
  assert.match(getHeroSkill("Persephone Lumi", "basic").description, /60 урона.*15 урона/i)
  assert.match(getHeroSkill("Katty", "basic").description, /облак|пшик/i)
})
