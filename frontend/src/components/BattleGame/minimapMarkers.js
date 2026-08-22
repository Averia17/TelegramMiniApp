export const getTeamMinimapAllies = (players = {}, localId = "") => {
  const localTeam = players?.[localId]?.team
  if (!localTeam) return []

  return Object.entries(players).filter(([id, player]) =>
    String(id) !== String(localId) &&
    player?.team === localTeam &&
    Number(player.lives) > 0 &&
    !player.hidden,
  )
}
