import {useCallback, useEffect, useRef, useState} from "react"
import {canKickPartyMember, canStartTeamParty, getPartyRosterModel} from "./partyRoster.js"
import {getInviteProgress, getInviteRemainingSeconds, getVisiblePartyOutgoingInvites} from "./partyInvites.js"
import {InteractivePopover} from "../InteractivePopover/InteractivePopover.jsx"
import "./PartyRoster.css"

const LONG_PRESS_MS = 550

export const PartyRoster = ({party, playerId, onLeave, onKick, onCancelInvite, outgoingInvites = []}) => {
  const model = getPartyRosterModel(party, playerId)
  const [kickTargetId, setKickTargetId] = useState("")
  const [clock, setClock] = useState(() => Date.now())
  const holdTimer = useRef(null)
  const clearHold = useCallback(() => {
    if (holdTimer.current) window.clearTimeout(holdTimer.current)
    holdTimer.current = null
  }, [])
  useEffect(() => () => clearHold(), [clearHold])
  useEffect(() => {
    if (kickTargetId && !model.members.some(member => String(member.playerId) === kickTargetId)) setKickTargetId("")
  }, [kickTargetId, model.members])
  useEffect(() => {
    if (!outgoingInvites.some(invite => invite?.status === "pending" || invite?.status === "declined")) return undefined
    const timer = window.setInterval(() => setClock(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [outgoingInvites])

  if (!model.active) return null
  const validation = canStartTeamParty(party.members, party.maxSize)
  const visibleOutgoingInvites = getVisiblePartyOutgoingInvites(outgoingInvites, clock)

  const startHold = (event, targetId) => {
    if (event.pointerType !== "touch") return
    clearHold()
    holdTimer.current = window.setTimeout(() => setKickTargetId(String(targetId)), LONG_PRESS_MS)
  }
  const finishHold = () => clearHold()
  const confirmKick = (event, targetId) => {
    event.preventDefault()
    event.stopPropagation()
    clearHold()
    setKickTargetId("")
    onKick?.(targetId)
  }
  return <section className="party-roster-widget" aria-label="Состав пати">
    <div className="party-roster-widget__header">
      <div><small>ТВОЯ ПАТИ</small><strong>{model.members.length}/{party.maxSize}</strong></div>
      <button onClick={onLeave}>ПОКИНУТЬ ПАТИ</button>
    </div>
    <div className="party-roster-widget__members">
      {model.members.map(member => {
        const targetId = String(member.playerId)
        const canKick = canKickPartyMember(party, playerId, targetId)
        const isKickTarget = kickTargetId === targetId
        const isLocal = String(member.playerId) === String(playerId)
        const displayName = isLocal ? "ТЫ" : (member.name || "Игрок")
        return <div className={`party-roster-widget__member ${isLocal ? "is-local" : ""} ${isKickTarget ? "is-kick-target" : ""}`} key={member.playerId}
          onPointerDown={canKick ? event => startHold(event, targetId) : undefined}
          onPointerUp={canKick ? finishHold : undefined}
          onPointerCancel={canKick ? finishHold : undefined}
          onPointerLeave={canKick ? finishHold : undefined}
          onContextMenu={canKick ? event => event.preventDefault() : undefined}>
          <span>{member.owner ? "★" : "●"}</span>
          <InteractivePopover className="party-roster-widget__name-popover" content={displayName} placement="left" onlyWhenOverflow>
            <>
              <button className="party-roster-widget__name" type="button" data-popover-overflow-target aria-label={`Показать полный ник: ${displayName}`}>{displayName}</button>
              <small>{member.hero || "Герой не выбран"}</small>
            </>
          </InteractivePopover>
          {canKick && <>
            <button className="party-roster-widget__kick party-roster-widget__kick--desktop" type="button" onClick={event => confirmKick(event, targetId)} aria-label={`Исключить ${member.name || "игрока"}`} title="Исключить игрока">×</button>
            <button className="party-roster-widget__kick party-roster-widget__kick--mobile" type="button" onClick={event => confirmKick(event, targetId)} aria-label={`Исключить ${member.name || "игрока"}`} tabIndex={isKickTarget ? 0 : -1}>×</button>
          </>}
        </div>})}
    </div>
    {visibleOutgoingInvites.length > 0 && <div className="party-roster-widget__invites" aria-live="polite">
      <small>ПРИГЛАШЕНИЯ</small>
      {visibleOutgoingInvites.map(invite => <div className={`party-roster-widget__invite is-${invite.status} ${invite.status === "invalid" ? "is-canceled" : ""}`} key={invite.inviteId}>
        {invite.status === "pending" ? <i className="party-roster-widget__loader" style={{"--invite-progress": `${getInviteProgress(invite, clock)}%`}} aria-label={`Осталось ${getInviteRemainingSeconds(invite, clock)} секунд`}>{getInviteRemainingSeconds(invite, clock)}</i> : <i className="party-roster-widget__declined" aria-hidden="true">×</i>}
        <div><b>{invite.status === "pending" ? `ЖДЁМ ОТВЕТА · ${getInviteRemainingSeconds(invite, clock)} СЕК.` : invite.status === "declined" ? "ИГРОК ОТКЛОНИЛ ПРИГЛАШЕНИЕ" : invite.invalidReason === "canceled" ? "ПРИГЛАШЕНИЕ ОТМЕНЕНО" : invite.invalidReason === "party_disbanded" ? "ПАТИ РАСПАЛАСЬ" : invite.invalidReason === "expired" ? "СРОК ИСТЁК" : "ПРИГЛАШЕНИЕ НЕДЕЙСТВИТЕЛЬНО"}</b><span>{invite.toName || invite.toId}</span></div>
        {invite.status === "pending" && <button className="party-roster-widget__cancel" type="button" onClick={() => onCancelInvite?.(invite.inviteId)}>ОТМЕНИТЬ</button>}
      </div>)}
    </div>}
    {!validation.ok && <div className="party-roster-widget__validation" role="status"><span>!</span>{validation.reason}</div>}
  </section>
}
