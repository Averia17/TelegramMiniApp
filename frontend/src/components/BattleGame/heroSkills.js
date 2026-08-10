import {HERO_KITS, TIMED_KIT_DESCRIPTIONS} from "./heroesConfig.js"

const skill = (name, description, effect) => Object.freeze({name, description, effect})

export const HERO_SKILLS = Object.freeze({
  Needle: Object.freeze({
    primary: skill("ЦВЕТЕНИЕ БЕЗДНЫ", "Поднимает вокруг героя живые лозы, замедляющие врагов.", "needle_abyss_bloom"),
    secondary: skill("СПОРОВЫЙ СКАЧОК", "Рывок вперёд с ядовитым взрывом в точке приземления.", "needle_spore_leap"),
  }),
  Mandy: Object.freeze({
    primary: skill("САХАРНЫЙ РАЗЛОМ", "После подготовки выпускает пробивающую арену сахарную волну.", "mandy_sugar_rift"),
    secondary: skill("КАРАМЕЛЬНЫЙ ЗАМОК", "Следующий взмах покрывает всех задетых врагов замедляющей карамелью.", "mandy_caramel_lock"),
  }),
  "Fairy Mina": Object.freeze({
    primary: skill("ЗВЁЗДНЫЙ ВАЛЬС", "Создаёт движущуюся с Миной ауру, которая лечит союзников.", "mina_starlight_waltz"),
    secondary: skill("ВЗМАХ КРЫЛЬЕВ", "Воздушная волна отбрасывает приблизившихся врагов.", "mina_wingbeat"),
  }),
  "Brock Zeus": Object.freeze({
    primary: skill("СУД ОЛИМПА", "Вызывает серию разрушающих стены молний в выбранной области.", "zeus_olympus_judgment"),
    secondary: skill("ГРОМОВАЯ ПЕЧАТЬ", "Следующий снаряд пробивает стены и оставляет электрическое пламя.", "zeus_thunderbrand"),
  }),
  Kaze: Object.freeze({
    primary: skill("ЛУННЫЙ РАЗРЕЗ", "Молниеносно проходит сквозь врагов, нанося урон и оглушая.", "kaze_mooncut"),
    secondary: skill("ШАГ ЗАВЕСЫ", "На короткое время растворяется в тумане и становится невидимой.", "kaze_veil_step"),
  }),
  "Wukong Mico": Object.freeze({
    primary: skill("ЗОЛОТОЙ ЦИКЛОН", "Круговой удар посохом сокрушает всех врагов вокруг.", "mico_golden_cyclone"),
    secondary: skill("ПЕЧАТЬ ЖУИ", "Следующий удар посохом сковывает и замедляет задетых врагов.", "mico_ruyi_bind"),
  }),
  "Persephone Lumi": Object.freeze({
    primary: skill("САД ЭРЕБА", "Выращивает сад, который один раз опутывает каждого вошедшего врага.", "lumi_erebus_garden"),
    secondary: skill("РАЗРЫВ СЕМЯН", "Взрывает все активные сады и ранит врагов внутри.", "lumi_seedburst"),
  }),
  Katty: Object.freeze({
    primary: skill("Баллон-граната", "Оставляет лужу краски, ослепляет врагов и наносит третий слой.", "paint_grenade"),
    secondary: skill("Красколёт", "Проходит сквозь стены во время рывка и оставляет замедляющий след.", "paint_flight"),
  }),
})

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
