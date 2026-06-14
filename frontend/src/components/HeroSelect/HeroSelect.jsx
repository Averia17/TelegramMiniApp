import {useState, useEffect} from 'react'
import axios from 'axios'
import {BATTLE_URL} from '../../utils/urls.js'
import './HeroSelect.css'

export const HeroSelect = ({onSelect, selectedHero}) => {
    const [heroes, setHeroes] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        axios.get(`${BATTLE_URL}/heroes`)
            .then(({data}) => setHeroes(data || []))
            .catch(() => {})
            .finally(() => setLoading(false))
    }, [])

    if (loading) {
        return <div className="hero-select-loading">Loading heroes...</div>
    }

    return (
        <div className="hero-select">
            <div className="hero-select-grid">
                {heroes.map(hero => (
                    <HeroCard
                        key={hero.name}
                        hero={hero}
                        selected={selectedHero === hero.name}
                        onClick={() => onSelect(hero.name)}
                    />
                ))}
            </div>
        </div>
    )
}

const HeroCard = ({hero, selected, onClick}) => {
    const bars = {
        hp: Math.min(10, hero.maxLives),
        speed: Math.round(hero.speed * 7),
        damage: Math.min(10, hero.attackDamage * 2 + 2),
        rate: Math.max(1, Math.round(12 - hero.attackRate / 100)),
    }

    return (
        <div
            className={`hero-card ${selected ? 'hero-card--selected' : ''}`}
            onClick={onClick}
            style={{'--hero-color': hero.color}}
        >
            <div className="hero-card-icon">
                <div className="hero-card-circle" style={{background: hero.color}}>
                    {hero.name[0]}
                </div>
            </div>

            <div className="hero-card-info">
                <div className="hero-card-name">{hero.name}</div>
                <div className="hero-card-role">{hero.role}</div>
            </div>

            <div className="hero-card-stats">
                <StatBar label="HP" value={bars.hp} max={10} color="#4CAF50"/>
                <StatBar label="SPD" value={bars.speed} max={10} color="#2196F3"/>
                <StatBar label="DMG" value={bars.damage} max={10} color="#f44336"/>
                <StatBar label="RATE" value={bars.rate} max={10} color="#FF9800"/>
            </div>

            <div className="hero-card-desc">{hero.desc}</div>

            {selected && <div className="hero-card-check">✓</div>}
        </div>
    )
}

const StatBar = ({label, value, max, color}) => (
    <div className="stat-bar">
        <span className="stat-bar-label">{label}</span>
        <div className="stat-bar-track">
            <div
                className="stat-bar-fill"
                style={{width: `${(value / max) * 100}%`, background: color}}
            />
        </div>
    </div>
)
