import {useState, useEffect, useCallback} from 'react'
import {useNavigate, useSearchParams} from 'react-router-dom'
import {HeroSelect} from '../components/HeroSelect/HeroSelect.jsx'
import {Leaderboard} from '../components/Tabs/Leaderboard.jsx'
import {ProfileTab} from '../components/Tabs/ProfileTab.jsx'
import './landing-page.css'

const TABS = ['play', 'rating', 'profile']

const LandingPage = ({id}) => {
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()
    const tabParam = searchParams.get('tab')
    const [tab, setTab] = useState(() => TABS.includes(tabParam) ? tabParam : 'play')
    const [selectedHero, setSelectedHero] = useState(null)

    useEffect(() => {
        if (TABS.includes(tabParam) && tabParam !== tab) {
            setTab(tabParam)
        }
    }, [tabParam])

    const switchTab = useCallback((t) => {
        setTab(t)
        setSearchParams({tab: t}, {replace: true})
    }, [setSearchParams])

    const handlePlay = useCallback(() => {
        if (!selectedHero) return
        navigate(`/battle?hero=${encodeURIComponent(selectedHero)}`)
    }, [selectedHero, navigate])

    return (
        <div className="lp">
            <div className="lp-content">
                {tab === 'play' && (
                    <div className="lp-play">
                        <div className="lp-header">
                            <div className="lp-logo">⚔️</div>
                            <h1 className="lp-title">Arena Battle</h1>
                            <p className="lp-subtitle">Choose your hero and fight</p>
                        </div>

                        <HeroSelect
                            onSelect={setSelectedHero}
                            selectedHero={selectedHero}
                        />

                        <div className="lp-action">
                            <button
                                className="lp-play-btn"
                                disabled={!selectedHero}
                                onClick={handlePlay}
                            >
                                {selectedHero ? `Play as ${selectedHero}` : 'Select a Hero'}
                            </button>
                        </div>
                    </div>
                )}

                {tab === 'rating' && <Leaderboard/>}
                {tab === 'profile' && <ProfileTab id={id}/>}
            </div>

            <nav className="lp-nav">
                <NavBtn icon="⚔️" label="Play" active={tab === 'play'} onClick={() => switchTab('play')}/>
                <NavBtn icon="🏆" label="Rating" active={tab === 'rating'} onClick={() => switchTab('rating')}/>
                <NavBtn icon="👤" label="Profile" active={tab === 'profile'} onClick={() => switchTab('profile')}/>
            </nav>
        </div>
    )
}

const NavBtn = ({icon, label, active, onClick}) => (
    <button className={`lp-nav-btn ${active ? 'lp-nav-btn--active' : ''}`} onClick={onClick}>
        <span className="lp-nav-icon">{icon}</span>
        <span className="lp-nav-label">{label}</span>
    </button>
)

export default LandingPage
