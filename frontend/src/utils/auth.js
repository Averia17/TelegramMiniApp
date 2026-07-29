import axios from "axios"
import {API_URL} from "./urls.js"

let accessToken = ""

const getDevelopmentUserId = () => {
  const queryId = new URLSearchParams(window.location.search).get("devUser")
  if (queryId && /^\d{1,18}$/.test(queryId) && Number(queryId) > 0) {
    window.localStorage.setItem("dev_user_id", queryId)
    return queryId
  }
  const storedId = window.localStorage.getItem("dev_user_id")
    || window.sessionStorage.getItem("dev_user_id")
  if (storedId) {
    window.localStorage.setItem("dev_user_id", storedId)
    return storedId
  }
  const generatedId = String(900_000_000 + crypto.getRandomValues(new Uint32Array(1))[0] % 99_999_999)
  window.localStorage.setItem("dev_user_id", generatedId)
  return generatedId
}

export const authenticate = async () => {
  const initData = window.Telegram?.WebApp?.initData || ""
  const devUserId = import.meta.env.DEV ? getDevelopmentUserId() : ""
  const headers = devUserId ? {"X-Dev-User-ID": devUserId} : {}
  const {data} = await axios.post(`${API_URL}/auth/telegram`, {init_data: initData}, {headers})
  accessToken = data.access_token
  axios.defaults.headers.common.Authorization = `Bearer ${accessToken}`
  return data
}

export const getAccessToken = () => accessToken
