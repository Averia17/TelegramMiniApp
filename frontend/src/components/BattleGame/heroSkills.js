import {HERO_KITS, TIMED_KIT_DESCRIPTIONS} from "./heroesConfig.js"

const skill = (name, description, effect) => Object.freeze({name, description, effect})

export const HERO_SKILLS = Object.freeze(Object.fromEntries(
  Object.entries(HERO_KITS).map(([hero, kit]) => [hero, Object.freeze({
    primary: skill(kit.super.name, kit.super.description, kit.super.id),
    secondary: skill(kit.gadget.name, kit.gadget.description, kit.gadget.id),
  })]),
))

const FALLBACK = Object.freeze({
  primary: skill("СУПЕР", "Сигнатурное умение героя.", "super"),
  secondary: skill("ГАДЖЕТ", "Тактическое умение героя.", "gadget"),
})

export const getHeroSkill = (hero, slot) =>
  (() => {
    const kitSlot = slot === "primary" ? "super" : slot === "secondary" ? "gadget" : "basic"
    const contract = HERO_KITS[String(hero || "")]?.[kitSlot]
    if (contract) return skill(contract.name, TIMED_KIT_DESCRIPTIONS[String(hero || "")]?.[kitSlot] || contract.description, contract.id)
    return HERO_SKILLS[String(hero || "")]?.[slot] || FALLBACK[slot] || FALLBACK.secondary
  })()
