const ABILITY_REJECTION_MESSAGES = {
  ability_unavailable: "Ability is unavailable",
  ability_cooldown: "Ability is recharging",
  gadget_unavailable: "No gadget charges",
  super_not_ready: "Super is not ready",
  ability_rejected: "Ability was not accepted",
}

export const formatCombatAbilityReason = (reason, slot = "") => {
  const message = ABILITY_REJECTION_MESSAGES[String(reason || "")]
  if (message) return message
  return slot === "secondary" ? "Gadget was not accepted" : "Ability was not accepted"
}

export const collectNewCombatAbilityRejections = (events, localPlayerId, seenIds = new Set()) => {
  const nextSeenIds = new Set(seenIds)
  const result = []
  const localId = String(localPlayerId ?? "")
  for (const event of Array.isArray(events) ? events : []) {
    const eventId = String(event?.id ?? "")
    if (!eventId || nextSeenIds.has(eventId)) continue
    nextSeenIds.add(eventId)
    if (
      event?.kind === "ability" &&
      String(event.sourceId ?? "") === localId &&
      event.accepted === false &&
      event.resolved !== false
    ) {
      result.push(event)
    }
  }
  return {events: result, seenIds: nextSeenIds}
}
