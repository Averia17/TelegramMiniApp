import {useEffect, useMemo, useState} from "react"
import axios from "axios"
import {BATTLE_URL} from "../../utils/urls.js"
import "./HeroSelect.css"

const RARITIES = ["rare", "super-rare", "epic", "mythic", "legendary"]

export const HeroSelect = ({onSelect, selectedHero}) => {
  const [heroes, setHeroes] = useState([])
  const [loading, setLoading] = useState(true)
  const [rosterOpen, setRosterOpen] = useState(false)

  useEffect(() => {
    axios.get(`${BATTLE_URL}/heroes`)
      .then(({data}) => setHeroes(data || []))
      .catch(() => {})
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
        <h1>{selected.name}</h1>
        <div className="hero-role"><span>{roleIcon(selected.role)}</span>{selected.role}</div>
      </div>

      <div className="hero-quick-stats">
        <QuickStat icon="❤" value={selected.maxLives} label="ЗДОРОВЬЕ"/>
        <QuickStat icon="⚡" value={Math.round(selected.speed * 10)} label="СКОРОСТЬ"/>
        <QuickStat icon="✹" value={selected.attackDamage} label="УРОН"/>
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
      <strong>{hero.name}</strong>
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
      <div className="hp-leg hp-leg--left"/><div className="hp-leg hp-leg--right"/>
      <div className="hp-body"><i/></div>
      <div className="hp-arm hp-arm--left"/><div className="hp-arm hp-arm--right"/>
      <div className="hp-head">
        <div className="hp-hair"/>
        <div className="hp-eye hp-eye--left"/><div className="hp-eye hp-eye--right"/>
        <div className="hp-mouth"/>
      </div>
      <div className="hp-weapon"><i/></div>
    </div>
  )
}
