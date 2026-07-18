import {useEffect, useMemo, useState} from "react"
import axios from "axios"
import {BATTLE_URL} from "../../utils/urls.js"
import {HeroModelPreview} from "./HeroModelPreview.jsx"
import "./HeroSelect.css"

const RARITIES = ["rare", "super-rare", "epic", "mythic", "legendary"]
const HERO_DISPLAY_NAMES = {Blaze: "КИРА", Frost: "СТРАЙКЕР", Viper: "ВУЛКАН", Titan: "ПРИЗРАК", Shadow: "ИГЛА", Spark: "ЖНЕЦ", Nova: "СЕЛЕСТА", Rex: "ЗИРО", Pixel: "ВЕКТОР", Boulder: "ТОКСИН"}
const heroDisplay = hero => HERO_DISPLAY_NAMES[hero?.name] || hero?.name

const HERO_DETAILS = {
  Blaze:{title:"Штурмовик-охотница",attack:"5×520 урона; попадания оставляют Метки",super:"Q: залп-детонация · E: перекат и щит",passive:"Метки усиливают добивание цели"},
  Frost:{title:"Энергетический стрелок",attack:"6×360 урона; узкая скоростная очередь",super:"Q: перегруженный луч · E: форсаж",passive:"Точный трекинг награждается пробиванием"},
  Viper:{title:"Тяжеловес-магматик",attack:"1850 урона сектором с притяжением",super:"Q: прыжок-извержение · E: 2600 щита",passive:"Самый высокий HP, но низкая скорость"},
  Titan:{title:"Цифровой киллер",attack:"Возвратный диск наносит 850 дважды",super:"Q: цифровой сбой · E: тройной диск",passive:"Самая высокая базовая скорость"},
  Shadow:{title:"Био-стрелок",attack:"1050 урона и 6 осколков при разрыве",super:"Q: замедляющая лиана · E: лечение 1450",passive:"Контролирует проходы и кусты"},
  Spark:{title:"Некро-убийца",attack:"Рывок косой на 1450 урона",super:"Q: Жатва 1750 · E: Рой теней",passive:"Жатва восстанавливает 650 HP"},
  Nova:{title:"Элитный снайпер",attack:"1200–2100 урона в зависимости от дистанции",super:"Q: 3 пробивных выстрела · E: отход",passive:"Максимальный урон на дальней дистанции"},
  Rex:{title:"Кинетический эмо",attack:"Два удара по 850 и конвертация в щит",super:"Q: магнитный удар · E: разгон",passive:"40% защиты во время активного щита"},
  Pixel:{title:"Модульный мех",attack:"Квантовое ядро 1250 с расщеплением",super:"Q: 5 ядер · E: эволюция",passive:"Эволюция ускоряет и укрепляет меха"},
  Boulder:{title:"Чумной вор",attack:"3×480 плюс 1200 яда за 4 секунды",super:"Q: 7 ядовитых дротиков · E: рывок",passive:"Яд продолжает наносить урон вне видимости"},
}

const FALLBACK_HEROES = [
  {name:"Blaze",color:"#c64bff",maxLives:5600,speed:1.12,attackDamage:520,role:"Assault"},
  {name:"Frost",color:"#35d9ff",maxLives:5000,speed:1.18,attackDamage:360,role:"Gunner"},
  {name:"Viper",color:"#ff7138",maxLives:9800,speed:.82,attackDamage:1850,role:"Tank"},
  {name:"Titan",color:"#42e3d2",maxLives:4700,speed:1.35,attackDamage:850,role:"Assassin"},
  {name:"Shadow",color:"#75d947",maxLives:6200,speed:.98,attackDamage:1050,role:"Controller"},
  {name:"Spark",color:"#6d52c7",maxLives:5400,speed:1.28,attackDamage:1450,role:"Assassin"},
  {name:"Nova",color:"#fff4d0",maxLives:4300,speed:1.05,attackDamage:1200,role:"Marksman"},
  {name:"Rex",color:"#4bc7ff",maxLives:7200,speed:1.2,attackDamage:850,role:"Bruiser"},
  {name:"Pixel",color:"#ffd43b",maxLives:6600,speed:1,attackDamage:1250,role:"Fighter"},
  {name:"Boulder",color:"#59d348",maxLives:5200,speed:1.18,attackDamage:480,role:"Debuffer"},
]

export const HeroSelect = ({onSelect, selectedHero}) => {
  const [heroes, setHeroes] = useState([])
  const [loading, setLoading] = useState(true)
  const [rosterOpen, setRosterOpen] = useState(false)

  useEffect(() => {
    axios.get(`${BATTLE_URL}/heroes`)
      .then(({data}) => setHeroes(data || []))
      .catch(() => setHeroes(FALLBACK_HEROES))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedHero && heroes[0]) onSelect(heroes[0].name)
  }, [heroes, onSelect, selectedHero])

  const selected = useMemo(
    () => heroes.find(hero => hero.name === selectedHero) || heroes[0],
    [heroes, selectedHero]
  )

  if (loading) {
    return <div className="hero-select-loading"><span/>ЗАГРУЖАЕМ БОЙЦОВ...</div>
  }

  if (!selected) {
    return <div className="hero-select-loading">БОЙЦЫ ПОКА НЕДОСТУПНЫ</div>
  }

  const selectHero = hero => {
    onSelect(hero.name)
    setRosterOpen(false)
  }

  return (
    <section className="hero-select" style={{"--hero-color": selected.color}}>
      <div className="hero-showcase">
        <div className="hero-rays"/>
        <div className="hero-float-particle hero-float-particle--one">✦</div>
        <div className="hero-float-particle hero-float-particle--two">✦</div>
        <HeroPortrait hero={selected} stage/>
        <div className="hero-stage-shadow"/>
      </div>

      <div className="hero-identity">
        <span className="hero-rarity">{rarityFor(selected, heroes)}</span>
        <h1>{heroDisplay(selected)}</h1>
        <div className="hero-role"><span>{roleIcon(selected.role)}</span>{selected.role}</div>
      </div>

      <div className="hero-quick-stats">
        <QuickStat icon="❤" value={selected.maxLives} label="ЗДОРОВЬЕ"/>
        <QuickStat icon="⚡" value={Math.round(selected.speed * 10)} label="СКОРОСТЬ"/>
        <QuickStat icon="✹" value={selected.attackDamage} label="УРОН"/>
      </div>

      <div className="hero-ability-card">
        <strong>{HERO_DETAILS[selected.name]?.title}</strong>
        <p><span>АТАКА</span>{HERO_DETAILS[selected.name]?.attack}</p>
        <p><span>Q / E</span>{HERO_DETAILS[selected.name]?.super}</p>
        <p><span>ПАССИВ</span>{HERO_DETAILS[selected.name]?.passive}</p>
      </div>

      <button className="hero-roster-button" onClick={() => setRosterOpen(true)}>
        <span className="hero-roster-grid"><i/><i/><i/><i/></span>
        БОЙЦЫ
        <b>{heroes.length}</b>
      </button>

      {rosterOpen && (
        <div className="hero-roster">
          <header className="hero-roster-header">
            <div>
              <small>КОЛЛЕКЦИЯ</small>
              <h2>БОЙЦЫ <span>{heroes.length}/{heroes.length}</span></h2>
            </div>
            <button onClick={() => setRosterOpen(false)} aria-label="Закрыть">✕</button>
          </header>
          <div className="hero-roster-filter">
            <span>Сначала: редкость</span>
            <b>▾</b>
          </div>
          <div className="hero-select-grid">
            {heroes.map((hero, index) => (
              <HeroCard
                key={hero.name}
                hero={hero}
                rarity={RARITIES[index % RARITIES.length]}
                selected={selected.name === hero.name}
                onClick={() => selectHero(hero)}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

const rarityFor = (hero, heroes) => {
  const index = Math.max(0, heroes.findIndex(item => item.name === hero.name))
  return RARITIES[index % RARITIES.length].replace("-", " ")
}

const roleIcon = role => ({
  Tank: "🛡",
  Assassin: "◆",
  Support: "✚",
  Controller: "◎",
  Sniper: "⌖",
  Bruiser: "✊",
  Attacker: "✹",
}[role] || "✦")

const QuickStat = ({icon, value, label}) => (
  <div className="hero-quick-stat">
    <span>{icon}</span>
    <strong>{value}</strong>
    <small>{label}</small>
  </div>
)

const HeroCard = ({hero, rarity, selected, onClick}) => (
  <button
    className={`hero-card hero-card--${rarity} ${selected ? "hero-card--selected" : ""}`}
    onClick={onClick}
    style={{"--hero-color": hero.color}}
  >
    <div className="hero-card-rank">РАНГ <b>{10 + hero.name.length}</b></div>
    <HeroPortrait hero={hero}/>
    <div className="hero-card-trophies"><span>🏆</span>{hero.maxLives * 100}</div>
    <div className="hero-card-footer">
      <strong>{heroDisplay(hero)}</strong>
      <span>СИЛА <b>{Math.min(11, hero.attackDamage + 7)}</b></span>
    </div>
    {selected && <i className="hero-card-check">✓</i>}
  </button>
)

const HeroPortrait = ({hero, stage = false}) => {
  const slug = hero.name.toLowerCase()
  return (
    <div className={`hero-portrait ${stage ? "hero-portrait--stage" : ""} hero-portrait--${slug}`} style={{"--hero-color": hero.color}}>
      <div className="hp-shadow"/>
      <HeroModelPreview hero={hero} stage={stage}/>
    </div>
  )
}
