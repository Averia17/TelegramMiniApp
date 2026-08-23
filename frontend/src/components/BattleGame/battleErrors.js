const SERVER_ERROR_MESSAGES = {
  "Authentication failed": "Не удалось подтвердить авторизацию. Откройте игру заново.",
  "Authentication required": "Авторизация истекла. Откройте игру заново.",
  "Room not found": "Комната боя не найдена. Вернитесь в меню и начните поиск заново.",
  "Room access denied": "Нет доступа к этой комнате боя. Вернитесь в меню и начните поиск заново.",
  "Party member is already in battle": "Кто-то из пати ещё находится в бою. Дождитесь выхода участника.",
  "Already in battle": "Ты уже находишься в бою. Выйди из текущего боя и попробуй снова.",
}

const normalizeServerMessage = message => String(message || "").trim().slice(0, 160)

export const getBattleErrorMessage = ({kind, message, code} = {}) => {
  if (kind === "asset_load") return "Не удалось загрузить ресурсы боя. Обновите игру и попробуйте ещё раз."
  if (kind === "connection_timeout") return "Сервер боя не ответил вовремя. Проверьте интернет и попробуйте ещё раз."
  if (kind === "connection_closed") {
    return Number(code) === 1008
      ? "Сервер отклонил подключение к бою. Откройте игру заново."
      : "Соединение с сервером боя прервано. Проверьте интернет и попробуйте ещё раз."
  }

  const normalizedMessage = normalizeServerMessage(message)
  if (normalizedMessage && SERVER_ERROR_MESSAGES[normalizedMessage]) return SERVER_ERROR_MESSAGES[normalizedMessage]
  if (normalizedMessage) return `Ошибка входа в бой: ${normalizedMessage}`
  return "Не удалось войти в бой. Попробуйте ещё раз."
}
