export const ATTACK_ARCHETYPES = Object.freeze({
  PROJECTILE: "projectile",
  BURST: "burst",
  SHOTGUN: "shotgun",
  PIERCING_AREA: "piercing_area",
  THROWER: "thrower",
  DASH: "dash",
  RETURNING: "returning",
})

// Combat configs use their final compact stat values directly.
export const ANIMATION_REFERENCE_SPEED = 12
export const RUNTIME_MOVEMENT_SPEED_SCALE = 12
export const RUNTIME_ANIMATION_REFERENCE_SPEED = ANIMATION_REFERENCE_SPEED * RUNTIME_MOVEMENT_SPEED_SCALE

export const HEROES_CONFIG = Object.freeze([
  {name:"Needle",color:"#75D947",maxLives:620,speed:12,attackDamage:65,bulletSpeed:23,attackType:"spore",role:"Controller",attack:{archetype:"projectile",aimShape:"line",range:620}},
  {name:"Mandy",color:"#F4C542",maxLives:720,speed:13,attackDamage:60,attackType:"mandy_staff",role:"Fighter",attack:{archetype:"melee_cone",aimShape:"cone",range:70,halfArcDegrees:42}},
  {name:"Fairy Mina",color:"#FF8FE8",maxLives:600,speed:14,attackDamage:40,bulletSpeed:30,attackType:"mina_star_fan",role:"Support",attack:{archetype:"shotgun",aimShape:"cone",range:510,projectileCount:3}},
  {name:"Brock Zeus",color:"#62C8FF",maxLives:620,speed:12,attackDamage:80,bulletSpeed:36,attackType:"zeus_lightning",role:"Sharpshooter",attack:{archetype:"projectile",aimShape:"line",range:760,splashRadius:72}},
  {name:"Kaze",color:"#B88CFF",maxLives:650,speed:16,attackDamage:40,attackType:"kaze_cross_slash",role:"Assassin",attack:{archetype:"melee_cone",aimShape:"cone",range:105,halfArcDegrees:55}},
  {name:"Wukong Mico",color:"#FFB33E",maxLives:900,speed:13,attackDamage:85,attackType:"mico_staff",role:"Tank",attack:{archetype:"melee_cone",aimShape:"cone",range:120,halfArcDegrees:50}},
  {name:"Damian",color:"#8D52D9",maxLives:640,speed:13,attackDamage:75,bulletSpeed:31,attackType:"damian_dark_orb",role:"Summoner",attack:{archetype:"projectile",aimShape:"line",range:640}},
  {name:"Persephone Lumi",color:"#D954A8",maxLives:680,speed:13,attackDamage:70,bulletSpeed:28,attackType:"lumi_trail_orb",role:"Controller",attack:{archetype:"projectile",aimShape:"line",range:600}},
])

// Fallback contract used before /heroes arrives. The server payload has the
// same shape and replaces these values through normalizeHeroConfig.
export const HERO_KITS = Object.freeze({
  Needle: {basic:{id:"spore_thorn",name:"Споровый шип",description:"Самонаводящийся шип накладывает Споры."},super:{id:"hunter_root",name:"Ловчий корень",description:"Корень подбрасывает врагов и оставляет замедляющую зону.",slot:"primary",prediction:"server"},gadget:{id:"spore_dash",name:"Споровый рывок",description:"Рывок оставляет облако спор.",slot:"secondary",prediction:"server"}},
  Mandy: {basic:{id:"staff_strike",name:"Удар посохом",description:"Неподвижность усиливает удар и оглушает."},super:{id:"devastation_wave",name:"Волна опустошения",description:"Дальняя волна разрушает стены.",slot:"primary",prediction:"server"},gadget:{id:"unyielding_stance",name:"Нерушимая стойка",description:"Стойка защищает от контроля и снижает урон.",slot:"secondary",prediction:"server"}},
  "Fairy Mina": {basic:{id:"star_fan",name:"Звёздный веер",description:"Звёзды лечат союзников и метят врагов."},super:{id:"star_cocoon",name:"Звёздный кокон",description:"Щит создаёт лечащую ауру.",slot:"primary",prediction:"server"},gadget:{id:"repelling_wave",name:"Отталкивающая волна",description:"Отбрасывает врагов и оглушает отмеченных.",slot:"secondary",prediction:"server"}},
  "Brock Zeus": {basic:{id:"thunder_projectile",name:"Грозовой снаряд",description:"Взрывной снаряд разрушает стены."},super:{id:"gods_hammer",name:"Молот богов",description:"Три удара молнии создают горящую зону.",slot:"primary",prediction:"server"},gadget:{id:"discharge_cable",name:"Разрядный кабель",description:"Следующий выстрел становится пробивающим лучом.",slot:"secondary",prediction:"server"}},
  Kaze: {basic:{id:"cross_slash",name:"Косые удары",description:"Два попадания открывают усиленный третий удар."},super:{id:"piercing_dash",name:"Пронзающий рывок",description:"Рывок помечает врагов и усиливает получаемый ими урон.",slot:"primary",prediction:"server"},gadget:{id:"vanish",name:"Исчезновение",description:"Невидимость гарантирует критический первый удар.",slot:"secondary",prediction:"server"}},
  "Wukong Mico": {basic:{id:"heavy_staff",name:"Тяжёлый посох",description:"Попадания накапливают Ярость."},super:{id:"vengeance_vortex",name:"Вихрь возмездия",description:"Вихрь расходует Ярость и наносит урон вокруг.",slot:"primary",prediction:"server"},gadget:{id:"stone_armor",name:"Каменная броня",description:"Щит накапливает урон и взрывается после окончания.",slot:"secondary",prediction:"server"}},
  Damian: {basic:{id:"blight_orb",name:"Сфера скверны",description:"Попадания снижают исходящий урон врага."},super:{id:"soul_totem",name:"Тотем душ",description:"Тотем автономно атакует ближайшего врага.",slot:"primary",prediction:"server"},gadget:{id:"exchange",name:"Обмен",description:"Меняет место с тотемом и взрывает его.",slot:"secondary",prediction:"server"}},
  "Persephone Lumi": {basic:{id:"luminous_trail",name:"Световой след",description:"След замедляет и раскрывает врагов."},super:{id:"root_garden",name:"Сад корней",description:"Поле корней обездвиживает вошедших врагов.",slot:"primary",prediction:"server"},gadget:{id:"flower_burst",name:"Цветочный взрыв",description:"Взрывает активный след или сад.",slot:"secondary",prediction:"server"}},
})

export const TIMED_KIT_DESCRIPTIONS = Object.freeze({
  Needle: {basic: "Споровый шип сразу замедляет поражённых врагов на 2 секунды."},
  Kaze: {basic: "Косые удары: усиленный удар доступен раз в 3 секунды."},
  "Wukong Mico": {
    basic: "Тяжёлый удар посохом наносит стабильный урон без накопления ярости.",
    super: "Вихрь возмездия длится 5 секунд и наносит урон вокруг героя.",
  },
  Damian: {basic: "Сфера скверны ослабляет поражённого врага на 4 секунды."},
})

export const HERO_AIM_DEFAULTS = Object.freeze({
  projectile: {shape: "line", color: "#ffffff"},
  burst: {shape: "line", color: "#8ee8ff"},
  shotgun: {shape: "cone", color: "#ffd36a"},
  piercing_area: {shape: "cone", color: "#8cffbc"},
  thrower: {shape: "lob", color: "#79caff"},
  dash: {shape: "cone", color: "#c895ff"},
  returning: {shape: "line", color: "#8ffff1"},
  melee_cone: {shape: "cone", color: "#d9a6ff"},
})

export const normalizeHeroConfig = hero => {
  const attack = hero?.attack || {}
  const visual = HERO_AIM_DEFAULTS[attack.archetype] || HERO_AIM_DEFAULTS.projectile
  const fallbackKit = HERO_KITS[hero?.name] || {}
  const rawKit = hero?.kit || fallbackKit
  const kit = Object.fromEntries(["basic", "super", "gadget"].map(slot => [slot, {
    ...(rawKit[slot] || fallbackKit[slot] || {}),
    slot: rawKit[slot]?.slot || (slot === "basic" ? "basic" : slot === "super" ? "primary" : "secondary"),
    prediction: rawKit[slot]?.prediction || (slot === "basic" ? "projectile" : "server"),
  }]))
  return {
    ...hero,
    kit,
    stats: {
      maxHealth: hero?.maxLives || 1,
      moveSpeed: hero?.speed || 0,
      radius: hero?.radius || 14,
      ammo: hero?.maxAmmo || 3,
      reloadMs: hero?.reloadTime || 0,
      regenRate: hero?.regenRate || 0,
    },
    attack: {...attack, aimShape: attack.aimShape || visual.shape},
    aim: {shape: attack.aimShape || visual.shape, color: hero?.color || visual.color},
  }
}

export const indexHeroConfigs = heroes => Object.fromEntries(
  (heroes || []).map(hero => {
    const normalized = normalizeHeroConfig(hero)
    return [normalized.name, normalized]
  }),
)
