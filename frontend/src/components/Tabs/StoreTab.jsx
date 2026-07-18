import {useEffect, useState} from "react"
import axios from "axios"
import {API_URL, SHOP_URL} from "../../utils/urls.js"
import "./StoreTab.css"
import "./Economy.css"

const chestStyle = productId => ({1001:{icon:"▣",kind:"ОБЫЧНЫЙ",tone:"blue"},1002:{icon:"◆",kind:"БОЛЬШОЙ",tone:"purple"},1003:{icon:"✦",kind:"МЕГА",tone:"gold"}})[productId] || {icon:"▣",kind:"СУНДУК",tone:"blue"}

export const StoreTab = ({userId,economy,onEconomyChange}) => {
  const [products,setProducts] = useState([])
  const [status,setStatus] = useState("loading")
  const [opening,setOpening] = useState(null)
  const [notice,setNotice] = useState("")
  const load = () => {
    setStatus("loading")
    axios.get(`${SHOP_URL}/`,{timeout:7000}).then(({data}) => {setProducts(Array.isArray(data)?data:[]);setStatus("ready")}).catch(() => setStatus("error"))
  }
  useEffect(load,[])
  return <section className="store-page">
    <div className="store-hero"><span>ПРЕДЛОЖЕНИЯ АРЕНЫ</span><h2>СУНДУКИ</h2><p>Содержимое появится в следующем обновлении</p></div>
    <div className="store-balance"><span>ТВОЙ БАЛАНС</span><b>● {economy?.gold || 0}</b><strong>⚡ {economy?.energy || 0}/{economy?.max_energy || 100}</strong></div>
    {notice && <div className="store-notice">{notice}</div>}
    {status === "loading" && <StoreState text="Загружаем магазин..."/>}
    {status === "error" && <StoreState text="Магазин временно недоступен" retry={load}/>}
    {status === "ready" && products.length === 0 && <StoreState text="Сундуки скоро появятся"/>}
    {status === "ready" && <div className="store-grid">{products.map(product => <ChestCard key={product.product_id} product={product} disabled={opening!==null || Number(economy?.gold||0)<Number(product.price)} onOpen={async() => {setOpening(product.product_id);setNotice("");try{const {data}=await axios.post(`${API_URL}/economy/${userId}/chests/${product.product_id}/open`);onEconomyChange?.({...economy,gold:data.gold,energy:data.energy,max_energy:data.max_energy});setNotice(`Сундук открыт: +${data.energy_reward} энергии${data.rolled_energy!==data.energy_reward?` (выпало ${data.rolled_energy}, максимум 100)`:""}`)}catch(error){setNotice(error.response?.data?.detail||"Не удалось открыть сундук")}finally{setOpening(null)}}}/>)}</div>}
  </section>
}

const ChestCard = ({product,disabled,onOpen}) => { const style=chestStyle(Number(product.product_id)); return <article className={`chest-card chest-card--${style.tone}`}><div className="chest-ribbon">{style.kind}</div><div className="chest-art"><i>{style.icon}</i><span>★</span></div><h3>{product.name}</h3><p>{product.description}</p><button type="button" disabled={disabled} onClick={onOpen}><b>{Number(product.price)}</b><span>🪙</span><small>{disabled?"НЕ ХВАТАЕТ ЗОЛОТА":"ОТКРЫТЬ"}</small></button></article> }
const StoreState = ({text,retry}) => <div className="store-state"><b>▣</b><span>{text}</span>{retry && <button onClick={retry}>ПОВТОРИТЬ</button>}</div>
