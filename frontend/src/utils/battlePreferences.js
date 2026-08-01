const legacyHeroKey = "battle_hero"

export const getBattleHeroKey = playerId => playerId ? `battle_hero:${playerId}` : legacyHeroKey

export const loadBattleHero = playerId => {
  try {
    return window.localStorage.getItem(getBattleHeroKey(playerId))
      || window.localStorage.getItem(legacyHeroKey)
      || ""
  } catch {
    return ""
  }
}

export const saveBattleHero = (playerId, heroName) => {
  try {
    if (heroName) window.localStorage.setItem(getBattleHeroKey(playerId), heroName)
  } catch {
    // A storage failure must not prevent entering a battle.
  }
}
