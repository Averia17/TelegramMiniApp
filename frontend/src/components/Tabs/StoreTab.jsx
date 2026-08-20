import {useEffect, useRef, useState} from "react"
import axios from "axios"
import {API_URL, SHOP_URL} from "../../utils/urls.js"
import {getTauntPurchaseState} from "./storeEconomy.js"
import "./StoreTab.css"
import "./Economy.css"

const chestStyle = productId => ({
  1001: {icon: "▣", kind: "ОБЫЧНЫЙ", tone: "blue"},
  1002: {icon: "◆", kind: "БОЛЬШОЙ", tone: "purple"},
  1003: {icon: "✦", kind: "МЕГА", tone: "gold"},
})[productId] || {icon: "▣", kind: "СУНДУК", tone: "blue"}

export const StoreTab = ({economy, onEconomyChange}) => {
  const [products, setProducts] = useState([])
  const [status, setStatus] = useState("loading")
  const [opening, setOpening] = useState(null)
  const [buyingTaunt, setBuyingTaunt] = useState(false)
  const [reward, setReward] = useState(null)
  const [notice, setNotice] = useState("")
  const rewardTimer = useRef(null)

  const load = () => {
    setStatus("loading")
    axios.get(`${SHOP_URL}/`, {timeout: 7000})
      .then(({data}) => {
        setProducts(Array.isArray(data) ? data : [])
        setStatus("ready")
      })
      .catch(() => setStatus("error"))
  }

  useEffect(() => {
    load()
    return () => clearTimeout(rewardTimer.current)
  }, [])

  const openChest = async product => {
    setOpening(product.product_id)
    setNotice("")
    try {
      const {data} = await axios.post(`${API_URL}/economy/me/chests/${product.product_id}/open`)
      onEconomyChange?.({...economy, gold: data.gold, crystals: data.crystals, energy: data.energy, max_energy: data.max_energy, taunt_active: data.taunt_active ?? economy.taunt_active, taunt_expires_at: data.taunt_expires_at ?? economy.taunt_expires_at})
      setReward({
        amount: data.energy_reward,
        rolled: data.rolled_energy,
        crystalsReward: data.crystals_reward || 0,
        tone: chestStyle(Number(product.product_id)).tone,
      })
      clearTimeout(rewardTimer.current)
      rewardTimer.current = setTimeout(() => setReward(null), 3200)
    } catch (error) {
      setNotice(error.response?.data?.detail || "Не удалось открыть сундук")
    } finally {
      setOpening(null)
    }
  }

  const buyTauntPack = async () => {
    setBuyingTaunt(true)
    setNotice("")
    try {
      const {data} = await axios.post(`${API_URL}/economy/me/taunt-pack`)
      onEconomyChange?.({...economy, crystals: data.crystals, taunt_active: data.taunt_active, taunt_expires_at: data.taunt_expires_at})
    } catch (error) {
      setNotice(error.response?.data?.detail || "Не удалось купить насмешки")
    } finally {
      setBuyingTaunt(false)
    }
  }

  const tauntPurchase = getTauntPurchaseState(economy, buyingTaunt)

  return <section className="store-page">
    <div className="store-hero"><span>ПРЕДЛОЖЕНИЯ АРЕНЫ</span><h2>СУНДУКИ</h2><p>Испытай удачу и пополни запас энергии</p></div>
    <div className="store-balance"><span>ТВОЙ БАЛАНС</span><b>◆ {economy?.crystals || 0}</b><b>● {economy?.gold || 0}</b><strong>⚡ {economy?.energy || 0}/{economy?.max_energy || 100}</strong></div>
    {notice && <div className="store-notice store-notice--error">{notice}</div>}
    <article className="taunt-pack-card">
      <div className="taunt-pack-card__icon">🤡</div>
      <div className="taunt-pack-card__copy"><strong>НАСМЕШКА НА ДЕНЬ</strong><span>Безлимитное использование · 24 часа</span><small>{economy?.taunt_active ? "АКТИВНА" : "НЕ КУПЛЕНА"}</small></div>
      <button type="button" disabled={tauntPurchase.disabled} title={tauntPurchase.title} onClick={buyTauntPack}><b>◆ {tauntPurchase.cost}</b><small>{tauntPurchase.buttonLabel}</small></button>
    </article>
    {status === "loading" && <StoreState text="Загружаем магазин..."/>}
    {status === "error" && <StoreState text="Магазин временно недоступен" retry={load}/>}
    {status === "ready" && products.length === 0 && <StoreState text="Сундуки скоро появятся"/>}
    {status === "ready" && <div className="store-grid">{products.map(product => <ChestCard
      key={product.product_id}
      product={product}
      isOpening={opening === product.product_id}
      insufficientGold={Number(economy?.gold || 0) < Number(product.price)}
      disabled={opening !== null || Number(economy?.gold || 0) < Number(product.price)}
      onOpen={() => openChest(product)}
    />)}</div>}
    {reward && <RewardReveal reward={reward} onClose={() => setReward(null)}/>}
  </section>
}

const ChestCard = ({product, disabled, isOpening, insufficientGold, onOpen}) => {
  const style = chestStyle(Number(product.product_id))
  return <article className={`chest-card chest-card--${style.tone}${isOpening ? " chest-card--opening" : ""}`}>
    <div className="chest-ribbon">{style.kind}</div>
    <div className="chest-art" aria-hidden="true"><i>{style.icon}</i><span>★</span><em/></div>
    <h3>{product.name}</h3>
    <p>{product.description}</p>
    <button type="button" disabled={disabled} onClick={onOpen}>
      <b>{Number(product.price)}</b><span>🪙</span>
      <small>{isOpening ? "ОТКРЫВАЕМ..." : insufficientGold ? "НЕ ХВАТАЕТ ЗОЛОТА" : "ОТКРЫТЬ"}</small>
    </button>
  </article>
}

const RewardReveal = ({reward, onClose}) => <div className={`reward-reveal reward-reveal--${reward.tone}`} role="dialog" aria-modal="true" aria-label="Сундук открыт" onClick={onClose}>
  <div className="reward-rays" aria-hidden="true"/>
  <div className="reward-particles" aria-hidden="true">{Array.from({length: 12}, (_, index) => <i key={index}/>)}</div>
  <div className="reward-content" onClick={event => event.stopPropagation()}>
    <span className="reward-kicker">СУНДУК ОТКРЫТ!</span>
    <div className="reward-chest" aria-hidden="true"><i/><b>✦</b></div>
    <div className="reward-energy"><span>⚡</span><strong>+{reward.amount}</strong></div>
    <p>ЭНЕРГИИ</p>
    {reward.crystalsReward > 0 && <div className="reward-crystals"><span>◆</span><strong>+{reward.crystalsReward}</strong><small>КРИСТАЛЛОВ</small></div>}
    {reward.rolled !== reward.amount && <small>Выпало {reward.rolled}, запас заполнен до максимума</small>}
    <button type="button" onClick={onClose}>ЗАБРАТЬ</button>
  </div>
</div>

const StoreState = ({text, retry}) => <div className="store-state"><b>▣</b><span>{text}</span>{retry && <button onClick={retry}>ПОВТОРИТЬ</button>}</div>
