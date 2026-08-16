const LAST_CONTACT_TTL_MS = 2000

export function createLastContactEffects(players = {}, now = Date.now()) {
  return Object.entries(players).flatMap(([id, player]) => {
    const contact = player?.lastContact
    if (!player?.hidden || !contact || now - Number(contact.at || 0) > LAST_CONTACT_TTL_MS) return []
    const life = Math.max(0, (Number(contact.at || 0) + LAST_CONTACT_TTL_MS - now) / 1000)
    return [{
      id: `last-contact:${id}:${contact.at}`,
      kind: "last_contact",
      x: Number(contact.x) || 0,
      y: Number(contact.y) || 0,
      angle: Math.atan2(Number(contact.directionY) || 0, Number(contact.directionX) || 0),
      radius: 28,
      life,
      maxLife: LAST_CONTACT_TTL_MS / 1000,
      color: player.color || "#ffffff",
    }]
  })
}
