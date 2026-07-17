const getBaseUrl = () => {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:"
  return `${proto}//${window.location.host}`
}

const getHttpUrl = () => {
  return `${window.location.protocol}//${window.location.host}`
}

export const WS_URL = import.meta.env.VITE_WEBSOCKET_URL || getBaseUrl()
export const API_URL = import.meta.env.VITE_BACKEND_URL || getHttpUrl()
export const BATTLE_URL = import.meta.env.VITE_BATTLE_URL || getHttpUrl()
export const LB_URL = import.meta.env.VITE_LEADERBOARD_URL || getHttpUrl()
