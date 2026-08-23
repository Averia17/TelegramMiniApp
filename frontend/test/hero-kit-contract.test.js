import test from "node:test"
import assert from "node:assert/strict"
import {HEROES_CONFIG, normalizeHeroConfig} from "../src/components/BattleGame/heroesConfig.js"

test("every hero has a complete normalized three-ability contract", () => {
  for (const hero of HEROES_CONFIG) {
    const kit = normalizeHeroConfig(hero).kit
    for (const slot of ["basic", "super", "gadget"]) {
      assert.ok(kit[slot].id, `${hero.name} missing ${slot} id`)
      assert.ok(kit[slot].name, `${hero.name} missing ${slot} name`)
      assert.ok(kit[slot].description, `${hero.name} missing ${slot} description`)
      assert.ok(kit[slot].prediction, `${hero.name} missing ${slot} prediction`)
    }
  }
})

test("hero combat stats use integer values", () => {
  for (const hero of HEROES_CONFIG) {
    for (const field of ["maxLives", "speed", "attackDamage", "bulletSpeed"]) {
      if (hero[field] !== undefined) assert.equal(Number.isInteger(hero[field]), true, `${hero.name} ${field} must be an integer`)
    }
  }
})

test("melee fallback configs can close on Needle and survive the approach", () => {
  const needle = HEROES_CONFIG.find(hero => hero.name === "Needle")
  const meleeHeroes = HEROES_CONFIG.filter(hero => hero.attack.archetype === "melee_cone")

  assert.ok(meleeHeroes.length > 0)
  for (const hero of meleeHeroes) {
    assert.ok(hero.speed >= needle.speed, `${hero.name} needs enough mobility to approach`)
    assert.ok(hero.maxLives >= needle.maxLives, `${hero.name} needs enough health to approach`)
  }
})

test("server hero kit payload takes precedence over local fallback", () => {
  const hero = normalizeHeroConfig({name: "Kaze", kit: {
    basic: {id: "server-basic", name: "Server basic", description: "authoritative"},
    super: {id: "server-super", name: "Server super", description: "authoritative", prediction: "server"},
    gadget: {id: "server-gadget", name: "Server gadget", description: "authoritative", prediction: "server"},
  }})
  assert.equal(hero.kit.basic.id, "server-basic")
  assert.equal(hero.kit.super.id, "server-super")
})
