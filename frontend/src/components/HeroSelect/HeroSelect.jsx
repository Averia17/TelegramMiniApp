import {useEffect, useMemo, useState} from "react"
import axios from "axios"
import {BATTLE_URL} from "../../utils/urls.js"
import {HeroModelPreview} from "./HeroModelPreview.jsx"
import {assetRegistry} from "../BattleGame/rendering/assets/AssetRegistry.js"
import "./HeroSelect.css"

const heroDisplay = hero => hero?.displayName || hero?.name
const combatType = hero => hero.attack?.archetype?.startsWith("melee") ? "БЛИЖНИЙ БОЙ" : "ДАЛЬНИЙ БОЙ"

export const HeroSelect = ({onSelect, selectedHero, battleMode = "solo", onModeChange}) => {
  const [heroes, setHeroes] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [rosterOpen, setRosterOpen] = useState(false)
  const [modeOpen, setModeOpen] = useState(false)

  useEffect(() => {
    axios.get(`${BATTLE_URL}/heroes`)
      .then(({data}) => {
        const supported = (data || [])
          .filter(hero => assetRegistry.hasHero(hero.name))
        if (!supported.length) throw new Error("Hero catalog is empty")
        setHeroes(supported)
      })
      .catch(() => {
        setHeroes([])
        setLoadError(true)
      })
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
    return <div className="hero-select-loading">{loadError ? "КАТАЛОГ ГЕРОЕВ НЕ ЗАГРУЖЕН" : "БОЙЦЫ ПОКА НЕДОСТУПНЫ"}</div>
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
        <span className="hero-rarity">{selected.rarity}</span>
        <h1>{heroDisplay(selected)}</h1>
        <div className="hero-role"><span>{roleIcon(selected.role)}</span>{selected.role}</div>
      </div>

      <div className="hero-quick-stats">
        <QuickStat icon="❤" value={selected.maxLives} label="ЗДОРОВЬЕ"/>
        <QuickStat icon="⚡" value={selected.speed} label="СКОРОСТЬ"/>
        <QuickStat icon="✹" value={selected.attackDamage} label="УРОН"/>
      </div>

      <div className="hero-ability-card">
        <strong>{selected.title}</strong>
        <p><span>АТАКА</span>{selected.attackDescription}</p>
        <p><span>Q / E</span>{selected.superDescription}</p>
        <p><span>ПАССИВ</span>{selected.passiveDescription}</p>
      </div>

      <div className="hero-lobby-actions">
        <button className="hero-roster-button" onClick={() => setRosterOpen(true)}>
          <span className="hero-roster-grid"><i/><i/><i/><i/></span>
          БОЙЦЫ
          <b>{heroes.length}</b>
        </button>
        <div className="hero-mode-picker">
          <button className={`hero-mode-button hero-mode-button--${battleMode}`} onClick={() => setModeOpen(open => !open)} aria-expanded={modeOpen} aria-haspopup="menu">
            <span>РЕЖИМ</span><strong>{battleMode === "team" ? "КОМАНДА" : "SOLO"}</strong><i>▾</i>
          </button>
          {modeOpen && <div className="hero-mode-menu" role="menu">
            <button className={battleMode === "solo" ? "is-active" : ""} onClick={() => { onModeChange?.("solo"); setModeOpen(false) }} role="menuitem"><strong>SOLO</strong><small>Каждый сам за себя</small></button>
            <button className={battleMode === "team" ? "is-active" : ""} onClick={() => { onModeChange?.("team"); setModeOpen(false) }} role="menuitem"><strong>КОМАНДА</strong><small>Ищи союзников или создай пати</small></button>
          </div>}
        </div>
      </div>

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
            {heroes.map(hero => (
              <HeroCard
                key={hero.name}
                hero={hero}
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

const HeroCard = ({hero, selected, onClick}) => (
  <button
    className={`hero-card hero-card--${hero.rarity} ${selected ? "hero-card--selected" : ""}`}
    onClick={onClick}
    style={{"--hero-color": hero.color}}
  >
    <HeroPortrait hero={hero}/>
    <div className="hero-card-footer">
      <strong>{heroDisplay(hero)}</strong>
      <small className="hero-card-combat-type">{combatType(hero)}</small>
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
