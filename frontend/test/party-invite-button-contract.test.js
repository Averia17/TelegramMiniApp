import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"
import test from "node:test"

const read = file => readFile(new URL(`../${file}`, import.meta.url), "utf8")

test("party invite buttons lock active targets and show a request loader", async () => {
  const source = await read("src/components/Party/PartyPanel.jsx")
  const css = await read("src/components/Party/PartyPanel.css")

  assert.match(source, /hasActiveOutgoingInviteForPlayer\(trackedOutgoingInvites, targetId, clock\)/)
  assert.match(source, /disabled=\{isSending \|\| isActive\}/)
  assert.match(source, /className="party-invite-send-loader"/)
  assert.match(source, /sendingInviteIdsRef\.current\.has\(targetId\)/)
  assert.match(css, /\.party-invite-send-loader\{[^}]*animation:party-invite-send-spin/)
})

test("party is created only as part of inviting a teammate", async () => {
  const source = await read("src/components/Party/PartyPanel.jsx")

  assert.match(source, /const activeParty = party \|\| await createParty\(\)/)
  assert.match(source, /Позови союзника — пати создастся автоматически/)
  assert.doesNotMatch(source, /\{!party && <button className="party-create"/)
})

test("party invite results use explicit success and error notification styles", async () => {
  const source = await read("src/components/Party/PartyPanel.jsx")
  const css = await read("src/components/Party/PartyPanel.css")

  assert.match(source, /messageType/)
  assert.match(source, /party-message party-message--\$\{messageType\}/)
  assert.match(source, /showMessage\("Приглашение отправлено", "success"\)/)
  assert.match(source, /showMessage\(isDuplicateInvite \?/)
  assert.match(css, /\.party-message--success\{/)
  assert.match(css, /\.party-message--error\{/)
})

test("declined outgoing invite keeps the party screen long enough to explain disbanding", async () => {
  const roster = await read("src/components/Party/PartyRoster.jsx")
  const landing = await read("src/pages/landing-page.jsx")

  assert.match(roster, /getVisiblePartyOutgoingInvites/)
  assert.match(roster, /ИГРОК ОТКЛОНИЛ ПРИГЛАШЕНИЕ/)
  assert.match(roster, /invite\.status === "pending" && <button/)
  assert.match(landing, /delayedPartyRemovalRef/)
  assert.match(landing, /OUTGOING_DECLINED_DISPLAY_MS/)
  assert.match(landing, /disbandedPartyIdsRef/)
  assert.match(landing, /mergeOutgoingInvitesAfterRefresh/)
  assert.match(landing, /resolvedOutgoingInvitesRef/)
})

test("incoming invite notifications ignore duplicate and stale WebSocket events", async () => {
  const source = await read("src/components/Party/PartyInviteNotifications.jsx")

  assert.match(source, /knownInvites/)
  assert.match(source, /shouldAcceptInviteUpdate/)
  assert.match(source, /rememberInvite\(message\.invite\)/)
})

test("party polling treats an authoritative null snapshot as removal", async () => {
  const landing = await read("src/pages/landing-page.jsx")
  const panel = await read("src/components/Party/PartyPanel.jsx")

  assert.match(landing, /handlePartyReady\(partyResponse\.value\.data, \{force: !partyResponse\.value\.data\?\.partyId\}\)/)
  assert.match(panel, /applyParty\(nextParty, \{force: !nextParty\}\)/)
})
