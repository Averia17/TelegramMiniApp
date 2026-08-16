const getBaseUrl = () => {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:"
  return `${proto}//${window.location.host}`
}

const getHttpUrl = () => {
  return `${window.location.protocol}//${window.location.host}`
}

export const API_URL = `${import.meta.env.VITE_BACKEND_URL || getHttpUrl()}/api/accounts`
export const SHOP_URL = `${import.meta.env.VITE_SHOP_URL || getHttpUrl()}/api/products`
export const BATTLE_URL = `${import.meta.env.VITE_BATTLE_URL || getHttpUrl()}/api/battle`
export const WS_URL = `${import.meta.env.VITE_WEBSOCKET_URL || getBaseUrl()}/api/battle`
export const LB_URL = `${import.meta.env.VITE_LEADERBOARD_URL || getHttpUrl()}/api/leaderboard`
export const PARTY_URL = `${import.meta.env.VITE_PARTY_URL || getHttpUrl()}/api/party`
export const PARTY_WS_URL = `${import.meta.env.VITE_PARTY_WS_URL || getBaseUrl()}/api/party/ws`
const configuredPartySize = Number(import.meta.env.VITE_MAX_PARTY_SIZE)
export const MAX_PARTY_SIZE = Number.isInteger(configuredPartySize) && configuredPartySize >= 2 && configuredPartySize <= 9
  ? configuredPartySize
  : 3
