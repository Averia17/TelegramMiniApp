// Combat configs use their final compact stat values directly.
export const ANIMATION_REFERENCE_SPEED = 12
const RUNTIME_MOVEMENT_SPEED_SCALE = 12
export const RUNTIME_ANIMATION_REFERENCE_SPEED = ANIMATION_REFERENCE_SPEED * RUNTIME_MOVEMENT_SPEED_SCALE

export const HEROES_CONFIG = Object.freeze([
  {name:"Needle",color:"#75D947",maxLives:600,maxAmmo:3,speed:13,attackDamage:60,bulletSpeed:23,attackType:"spore",role:"Controller",attack:{archetype:"projectile",aimShape:"line",range:620}},
  {name:"Mandy",color:"#F4C542",maxLives:700,maxAmmo:3,speed:15,attackDamage:100,attackType:"mandy_staff",role:"Fighter",attack:{archetype:"melee_cone",aimShape:"cone",range:110,halfArcDegrees:60}},
  {name:"Fairy Mina",color:"#FF8FE8",maxLives:650,maxAmmo:3,speed:14,attackDamage:40,bulletSpeed:30,attackType:"mina_star_fan",role:"Support",attack:{archetype:"shotgun",aimShape:"cone",range:510,projectileCount:3}},
  {name:"Brock Zeus",color:"#62C8FF",maxLives:600,maxAmmo:3,speed:12,attackDamage:85,bulletSpeed:36,attackType:"zeus_lightning",role:"Sharpshooter",attack:{archetype:"projectile",aimShape:"line",range:760,splashRadius:80}},
  {name:"Kaze",color:"#B88CFF",maxLives:650,maxAmmo:3,speed:16,attackDamage:85,attackType:"kaze_cross_slash",role:"Assassin",attack:{archetype:"melee_cone",aimShape:"cone",range:125,halfArcDegrees:60}},
  {name:"Wukong Mico",color:"#FFB33E",maxLives:900,maxAmmo:3,speed:14,attackDamage:100,attackType:"mico_staff",role:"Tank",attack:{archetype:"melee_cone",aimShape:"cone",range:140,halfArcDegrees:60}},
  {name:"Persephone Lumi",color:"#D954A8",maxLives:680,maxAmmo:3,speed:15,attackDamage:60,bulletSpeed:28,bulletSize:8,attackType:"lumi_orb",role:"Controller",attack:{archetype:"projectile",aimShape:"line",range:520,projectileKind:"lumi_orb"}},
  {name:"Katty",color:"#FF5C9A",maxLives:640,maxAmmo:3,speed:14,attackDamage:55,attackType:"katty_paint_spray",role:"Controller",attack:{archetype:"projectile",aimShape:"line",range:220,projectileKind:"katty_paint_spray",splashRadius:65,modifier:"katty_paint_cloud"}},
])

// Fallback contract used before /heroes arrives. The server payload has the
// same shape and replaces these values through normalizeHeroConfig.
export const HERO_KITS = Object.freeze({
  Needle: {basic:{id:"spore_thorn",name:"Споровый шип",description:"Спора летит по прямой, снижает лечение цели на 50% на 2 секунды и раскрывается шестью фиксированными шипами."},super:{id:"hunter_root",name:"Ловчий корень",description:"После 300 мс замаха корень наносит 40 урона, притягивает врагов к центру и оставляет на 3 секунды зону с уроном 15 каждые 0,5 секунды и замедлением 60%.",slot:"primary",prediction:"server"},gadget:{id:"spore_escape",name:"Споровый побег",description:"Рывок на 6 метров оставляет облако спор радиусом 90 на 2 секунды: оно замедляет на 40%, а третий стак спор оглушает.",slot:"secondary",prediction:"server"}},
  Mandy: {basic:{id:"staff_strike",name:"Удар посохом",description:"Наносит 100 урона и оглушает на 0,3 секунды. Фокус после 2 секунд неподвижности усиливает удар до 150, увеличивает радиус и оглушает на 0,8 секунды."},super:{id:"devastation_wave",name:"Волна опустошения",description:"Через всю карту после подготовки 0,8 секунды выпускает волну на 140–220 урона, оглушает на 1,2 секунды и разрушает стены; Mandy может двигаться и защищена щитом 30% HP.",slot:"primary",prediction:"server"},gadget:{id:"unyielding_stance",name:"Нерушимая стойка",description:"На 1,8 секунды снижает входящий урон на 40%; следующий удар наносит на 50% больше урона и лечит Mandy на 10% HP при попадании.",slot:"secondary",prediction:"server"}},
  "Fairy Mina": {basic:{id:"star_fan",name:"Звёздный веер",description:"Звёзды наносят 40 урона и лечат Mina на 5 HP за попадание; третье попадание взрывает метку на 80 урона в радиусе 100."},super:{id:"star_cocoon",name:"Звёздный кокон",description:"Всегда применяется на Mina: щит 500 HP на 4 секунды и аура радиусом 180 лечит её и наносит врагам урон.",slot:"primary",prediction:"server"},gadget:{id:"repelling_wave",name:"Отталкивающая волна",description:"Волна радиусом 150 наносит 30 урона, отбрасывает врагов и очищает отрицательные эффекты Mina.",slot:"secondary",prediction:"server"}},
  "Brock Zeus": {basic:{id:"thunder_projectile",name:"Грозовой снаряд",description:"Снаряд наносит 85 урона, взрывается радиусом 80 и не разрушает стены."},super:{id:"gods_hammer",name:"Молот богов",description:"Три удара через 0,7/1,1/1,5 секунды наносят 80/80/120 урона, замедляют и каждый разрушают стены.",slot:"primary",prediction:"server"},gadget:{id:"discharge_cable",name:"Разрядный кабель",description:"Пробивающий луч оставляет огненный след на 3 секунды: 5 урона каждые 0,5 секунды.",slot:"secondary",prediction:"server"}},
  Kaze: {basic:{id:"cross_slash",name:"Косые удары",description:"Два попадания открывают усиленный третий удар; по цели ниже 30% HP он получает ещё +20% урона."},super:{id:"piercing_dash",name:"Пронзающий рывок",description:"Рывок наносит 160 урона и оглушает на 1 секунду; убийство сбрасывает перезарядку, после рывка Kaze ускоряется на 2 секунды.",slot:"primary",prediction:"server"},gadget:{id:"vanish",name:"Исчезновение",description:"Невидимость на 3 секунды гарантирует первый удар с критом +100% урона.",slot:"secondary",prediction:"server"}},
  "Wukong Mico": {basic:{id:"heavy_staff",name:"Тяжёлый посох",description:"Попадания накапливают до 5 зарядов Ярости."},super:{id:"vengeance_vortex",name:"Вихрь возмездия",description:"Короткий прыжок запускает вихрь: притягивает врагов на 20%, наносит 35 урона при старте, оглушает на 0,6 секунды, тикает каждые 0,4 секунды и лечит Mico.",slot:"primary",prediction:"server"},gadget:{id:"stone_armor",name:"Каменная броня",description:"4 секунды снижает урон на 60%, хранит до 240 урона и взрывается на 80 урона в радиусе 140.",slot:"secondary",prediction:"server"}},
  "Persephone Lumi": {basic:{id:"luminous_flower",name:"Световой цветок",description:"Цветок летит на 520 и прорастает при попадании или в конце пути: 60 урона сразу, затем 15 урона каждые 0,5 секунды в течение 6 секунд; враги замедляются и раскрываются."},super:{id:"root_garden",name:"Сад корней",description:"После 600 мс поле наносит 60 урона и оглушает врагов в радиусе на 1 секунду, затем замедляет их на 60%.",slot:"primary",prediction:"server"},gadget:{id:"flower_burst",name:"Цветочный взрыв",description:"Поглощает цветы и сад, наносит каждой цели один общий всплеск на 55 урона и лечит Lumi на 10 HP за объект, максимум 50.",slot:"secondary",prediction:"server"}},
  Katty: {basic:{id:"paint_spray",name:"Краска-пшик",description:"Пшик наносит 55 урона в радиусе 65; третий слой даёт +45% урона и оглушение."},super:{id:"paint_grenade",name:"Красящая лужа",description:"Лужа радиусом 220 в выбранной точке слегка притягивает врагов, наносит 70 урона, ослепляет и замедляет их.",slot:"primary",prediction:"server"},gadget:{id:"paint_flight",name:"Красколёт",description:"На 2,2 секунды ускоряет Katty и оставляет след; касание следа взрывает его на 40 урона и 2 слоя краски.",slot:"secondary",prediction:"server"}},
})

export const TIMED_KIT_DESCRIPTIONS = Object.freeze({})

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

export const normalizeHeroConfig = (hero, {useFallbackKit = true} = {}) => {
  const attack = hero?.attack || {}
  const visual = HERO_AIM_DEFAULTS[attack.archetype] || HERO_AIM_DEFAULTS.projectile
  const fallbackKit = HERO_KITS[hero?.name] || {}
  const rawKit = hero?.kit || (useFallbackKit ? fallbackKit : {})
  const kit = Object.fromEntries(["basic", "super", "gadget"].map(slot => [slot, {
    ...(rawKit[slot] || (useFallbackKit ? fallbackKit[slot] : {}) || {}),
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
