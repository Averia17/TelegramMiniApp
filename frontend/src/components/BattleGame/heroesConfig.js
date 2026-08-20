// Combat configs use their final compact stat values directly.
export const ANIMATION_REFERENCE_SPEED = 12
const RUNTIME_MOVEMENT_SPEED_SCALE = 12
export const RUNTIME_ANIMATION_REFERENCE_SPEED = ANIMATION_REFERENCE_SPEED * RUNTIME_MOVEMENT_SPEED_SCALE

export const HEROES_CONFIG = Object.freeze([
  {name:"Needle",color:"#75D947",maxLives:620,maxAmmo:3,speed:12,attackDamage:65,bulletSpeed:23,attackType:"spore",role:"Controller",attack:{archetype:"projectile",aimShape:"line",range:620}},
  {name:"Mandy",color:"#F4C542",maxLives:720,maxAmmo:3,speed:15,attackDamage:105,attackType:"mandy_staff",role:"Fighter",attack:{archetype:"melee_cone",aimShape:"cone",range:110,halfArcDegrees:60}},
  {name:"Fairy Mina",color:"#FF8FE8",maxLives:600,maxAmmo:3,speed:14,attackDamage:40,bulletSpeed:30,attackType:"mina_star_fan",role:"Support",attack:{archetype:"shotgun",aimShape:"cone",range:510,projectileCount:3}},
  {name:"Brock Zeus",color:"#62C8FF",maxLives:620,maxAmmo:3,speed:12,attackDamage:80,bulletSpeed:36,attackType:"zeus_lightning",role:"Sharpshooter",attack:{archetype:"projectile",aimShape:"line",range:760,splashRadius:72}},
  {name:"Kaze",color:"#B88CFF",maxLives:700,maxAmmo:3,speed:16,attackDamage:85,attackType:"kaze_cross_slash",role:"Assassin",attack:{archetype:"melee_cone",aimShape:"cone",range:125,halfArcDegrees:60}},
  {name:"Wukong Mico",color:"#FFB33E",maxLives:900,maxAmmo:3,speed:15,attackDamage:100,attackType:"mico_staff",role:"Tank",attack:{archetype:"melee_cone",aimShape:"cone",range:140,halfArcDegrees:60}},
  {name:"Persephone Lumi",color:"#D954A8",maxLives:700,maxAmmo:3,speed:15,attackDamage:90,attackType:"lumi_scythe",role:"Controller",attack:{archetype:"melee_cone",aimShape:"cone",range:120,halfArcDegrees:60}},
  {name:"Katty",color:"#FF5C9A",maxLives:640,maxAmmo:3,speed:14,attackDamage:42,attackType:"katty_paint_spray",role:"Controller",attack:{archetype:"projectile",aimShape:"line",range:220,projectileKind:"katty_paint_spray",splashRadius:58,modifier:"katty_paint_cloud"}},
])

// Fallback contract used before /heroes arrives. The server payload has the
// same shape and replaces these values through normalizeHeroConfig.
export const HERO_KITS = Object.freeze({
  Needle: {basic:{id:"spore_thorn",name:"Споровый шип",description:"Спора летит по прямой и при попадании или в конце полёта раскрывается шестью фиксированными радиальными шипами."},super:{id:"hunter_root",name:"Ловчий корень",description:"Корень оглушает врагов и оставляет замедляющую зону.",slot:"primary",prediction:"server"},gadget:{id:"moisture_reserve",name:"Запас влаги",description:"Гарантированно восстанавливает 30% максимального здоровья за 3 секунды даже при получении урона.",slot:"secondary",prediction:"server"}},
  Mandy: {basic:{id:"staff_strike",name:"Удар посохом",description:"Наносит 105 урона и оглушает цель на 0,25 секунды. После 2 секунд неподвижности Фокус усиливает следующий удар в 1,5 раза, увеличивает дальность и оглушает на 1 секунду."},super:{id:"devastation_wave",name:"Волна опустошения",description:"После подготовки выпускает волну через всю карту, разрушает стены и оглушает врагов на 1 секунду; во время подготовки Mandy может двигаться.",slot:"primary",prediction:"server"},gadget:{id:"unyielding_stance",name:"Нерушимая стойка",description:"На 1,8 секунды снижает входящий урон на 40%; следующий удар посохом наносит на 50% больше урона и замедляет цель.",slot:"secondary",prediction:"server"}},
  "Fairy Mina": {basic:{id:"star_fan",name:"Звёздный веер",description:"Три прямых звезды: врага метят и повторным попаданием взрывают метку, союзника лечат."},super:{id:"star_cocoon",name:"Звёздный кокон",description:"Выбирает самого раненого союзника рядом; щит и лечащая аура следуют за ним.",slot:"primary",prediction:"server"},gadget:{id:"repelling_wave",name:"Отталкивающая волна",description:"Отбрасывает врагов и оглушает отмеченных.",slot:"secondary",prediction:"server"}},
  "Brock Zeus": {basic:{id:"thunder_projectile",name:"Грозовой снаряд",description:"Снаряд взрывается при столкновении или в конце дальности, но не разрушает стены."},super:{id:"gods_hammer",name:"Молот богов",description:"Показывает три точки удара молнии; последний удар больше и разрушает стены.",slot:"primary",prediction:"server"},gadget:{id:"discharge_cable",name:"Разрядный кабель",description:"Следующий выстрел становится пробивающим лучом.",slot:"secondary",prediction:"server"}},
  Kaze: {basic:{id:"cross_slash",name:"Косые удары",description:"Два попадания открывают усиленный третий удар."},super:{id:"piercing_dash",name:"Пронзающий рывок",description:"Попадание рывком оглушает на 1 секунду и сразу подготавливает усиленный следующий удар Kaze.",slot:"primary",prediction:"server"},gadget:{id:"vanish",name:"Исчезновение",description:"Невидимость гарантирует критический первый удар.",slot:"secondary",prediction:"server"}},
  "Wukong Mico": {basic:{id:"heavy_staff",name:"Тяжёлый посох",description:"Попадания накапливают до 5 зарядов Ярости."},super:{id:"vengeance_vortex",name:"Вихрь возмездия",description:"Сразу оглушает врагов на 1 секунду, затем расходует Ярость, увеличивая радиус, длительность и урон вихря.",slot:"primary",prediction:"server"},gadget:{id:"stone_armor",name:"Каменная броня",description:"Броня снижает входящий урон и превращает поглощённый урон в Ярость без ответного взрыва.",slot:"secondary",prediction:"server"}},
  "Persephone Lumi": {basic:{id:"luminous_flower",name:"Световой цветок",description:"Снаряд наносит прямой урон и выращивает один замедляющий и раскрывающий цветок в точке остановки."},super:{id:"root_garden",name:"Сад корней",description:"Поле корней обездвиживает вошедших врагов.",slot:"primary",prediction:"server"},gadget:{id:"flower_burst",name:"Цветочный взрыв",description:"Поглощает все цветки и сады, нанося каждой цели один общий всплеск.",slot:"secondary",prediction:"server"}},
  Katty: {basic:{id:"paint_spray",name:"Краска-пшик",description:"Короткий направленный пшик наносит 42 урона всем целям в радиусе 58 и оставляет облако краски вокруг точки попадания."},super:{id:"paint_grenade",name:"Баллон-граната",description:"После приземления взрыв наносит 70 урона, а лужа радиусом 220 наносит по 12 урона каждые 0,6 секунды, ослепляет и замедляет врагов.",slot:"primary",prediction:"server"},gadget:{id:"paint_flight",name:"Красколёт",description:"Рывок оставляет след краски, замедляющий врагов и ускоряющий Кэтти.",slot:"secondary",prediction:"server"}},
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
