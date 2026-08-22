export const MIN_PLAYER_SEARCH_LENGTH = 2

export const normalizePlayerSearchInput = value => String(value || "").trim().replace(/\s+/g, " ")

export const shouldSearchPlayers = value => normalizePlayerSearchInput(value).length >= MIN_PLAYER_SEARCH_LENGTH
