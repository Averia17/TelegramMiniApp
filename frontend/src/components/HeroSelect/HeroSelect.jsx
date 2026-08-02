import {useEffect, useMemo, useState} from "react"
import axios from "axios"
import {BATTLE_URL} from "../../utils/urls.js"
import {HeroModelPreview} from "./HeroModelPreview.jsx"
import {HEROES_CONFIG, normalizeHeroConfig} from "../BattleGame/heroesConfig.js"
import {assetRegistry} from "../BattleGame/rendering/assets/AssetRegistry.js"
import "./HeroSelect.css"

const RARITIES = ["rare", "super-rare", "epic", "mythic", "legendary"]
const HERO_DISPLAY_NAMES = {
  Needle: "NEEDLE",
  Mandy: "MANDY",
  "Fairy Mina": "FAIRY MINA",
  "Brock Zeus": "BROCK ZEUS",
  Kaze: "KAZE",
  "Wukong Mico": "WUKONG MICO",
  Damian: "DAMIAN",
  "Persephone Lumi": "PERSEPHONE LUMI",
}
const heroDisplay = hero => HERO_DISPLAY_NAMES[hero?.name] || hero?.name

const HERO_DETAILS = {
  Needle:{title:"Био-стрелок",attack:"65 урона и 6 осколков при разрыве",super:"Q: замедляющая лиана · E: лечение 145",passive:"Контролирует проходы и кусты"},
  Mandy:{title:"Сахарный боец ближнего боя",attack:"60 урона конусным ударом посоха",super:"Q: волна через всю карту · E: Карамелизация",passive:"Стоя 1 секунду, получает +35% к дальности"},
}

const FALLBACK_HEROES = HEROES_CONFIG

export const HeroSelect = ({onSelect, selectedHero}) => {
  const [heroes, setHeroes] = useState([])
  const [loading, setLoading] = useState(true)
  const [rosterOpen, setRosterOpen] = useState(false)

  useEffect(() => {
    axios.get(`${BATTLE_URL}/heroes`)
      .then(({data}) => {
        const supported = (data || [])
          .filter(hero => assetRegistry.hasHero(hero.name))
          .map(normalizeHeroConfig)
        setHeroes(supported.length ? supported : FALLBACK_HEROES.map(normalizeHeroConfig))
      })
      .catch(() => setHeroes(FALLBACK_HEROES.map(normalizeHeroConfig)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedHero && heroes[0]) onSelect(heroes[0].name)
  }, [heroes, onSelect, selectedHero])

  useEffect(() => {
    if (!selectedHero || !heroes.length) return undefined
    const warm = () => assetRegistry.preloadHeroes([selectedHero], 1)
    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(warm, {timeout: 1200})
      return () => window.cancelIdleCallback?.(idleId)
    }
    const timer = window.setTimeout(warm, 150)
    return () => window.clearTimeout(timer)
  }, [heroes, selectedHero])

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
        <QuickStat icon="⚡" value={selected.speed} label="СКОРОСТЬ"/>
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
  const slug = hero.name.toLowerCase().replace(/\s+/g, "-")
  return (
    <div className={`hero-portrait ${stage ? "hero-portrait--stage" : ""} hero-portrait--${slug}`} style={{"--hero-color": hero.color}}>
      <div className="hp-shadow"/>
      <HeroModelPreview hero={hero} stage={stage}/>
    </div>
  )
}
