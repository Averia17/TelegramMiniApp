import {useEffect, useState} from "react"
import axios from "axios"
import {NEWS_URL} from "../../utils/urls.js"
import "./Tabs.css"

export const NewsTab = () => {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [nextCursor, setNextCursor] = useState("")
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true
    axios.get(NEWS_URL, {timeout: 7000, params: {limit: 20}}).then(({data}) => {
      if (active) {
        setItems(Array.isArray(data?.items) ? data.items : [])
        setNextCursor(String(data?.nextCursor || ""))
      }
    }).catch(() => active && setError("Новости временно недоступны")).finally(() => active && setLoading(false))
    return () => { active = false }
  }, [])

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const {data} = await axios.get(NEWS_URL, {timeout: 7000, params: {limit: 20, cursor: nextCursor}})
      setItems(current => [...current, ...(Array.isArray(data?.items) ? data.items : [])])
      setNextCursor(String(data?.nextCursor || ""))
    } catch {
      setError("Не удалось загрузить ещё новости")
    } finally {
      setLoadingMore(false)
    }
  }

  if (loading) return <NewsState icon="⏳" text="Загружаем новости..."/>
  if (error) return <NewsState icon="⚠" text={error}/>
  if (!items.length) return <NewsState icon="✦" text="Скоро здесь появятся новости арены"/>

  return <section className="bs-news" aria-label="Новости обновлений">
    {items.map(item => <article className="bs-news-card" key={item.id || item.tag}>
      <div className="bs-news-card__meta"><span>ОБНОВЛЕНИЕ</span><strong>{item.tag}</strong></div>
      <h2>{item.title}</h2>
      <p>{item.body}</p>
      <time dateTime={item.published_at}>{formatDate(item.published_at)}</time>
    </article>)}
    {nextCursor && <button className="bs-news-more" type="button" onClick={loadMore} disabled={loadingMore}>{loadingMore ? "ЗАГРУЖАЕМ..." : "ПОКАЗАТЬ ЕЩЁ"}</button>}
  </section>
}

const formatDate = value => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("ru-RU", {day: "2-digit", month: "long", year: "numeric"})
}

const NewsState = ({icon, text}) => <div className="bs-state bs-news-state"><b>{icon}</b><span>{text}</span></div>
