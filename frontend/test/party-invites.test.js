import test from "node:test"
import assert from "node:assert/strict"
import {dismissInviteNotification, getInviteNotificationDisplayMs, getInviteProgress, getInviteRemainingSeconds, getNotificationProgress, getVisibleIncomingInvites, getVisibleOutgoingInvites, getVisiblePartyInvites, getVisiblePartyOutgoingInvites, hasActiveOutgoingInviteForPlayer, INVITE_INVALID_DISPLAY_MS, INVITE_INVALID_NOTIFICATION_DISPLAY_MS, INVITE_NOTIFICATION_DISPLAY_MS, mergeOutgoingInvites, mergeOutgoingInvitesAfterRefresh, OUTGOING_DECLINED_DISPLAY_MS, shouldAcceptInviteUpdate} from "../src/components/Party/partyInvites.js"

test("outgoing invite model keeps pending invitations visible", () => {
  const invites = getVisibleOutgoingInvites([
    {inviteId: "pending", status: "pending", toId: "2", toName: "Друг"},
  ], 10_000)

  assert.deepEqual(invites.map(invite => invite.inviteId), ["pending"])
})

test("active outgoing invite blocks inviting the same player until it is resolved or expires", () => {
  const pending = {inviteId: "pending", status: "pending", toId: "2", expiresAt: 20_000}
  const declined = {inviteId: "declined", status: "declined", toId: "3"}
  const invalid = {inviteId: "invalid", status: "invalid", toId: "4", respondedAt: 10_000}

  assert.equal(hasActiveOutgoingInviteForPlayer([pending, declined, invalid], "2", 19_999), true)
  assert.equal(hasActiveOutgoingInviteForPlayer([pending], "2", 20_000), false)
  assert.equal(hasActiveOutgoingInviteForPlayer([declined, invalid], "3", 10_000), false)
  assert.equal(hasActiveOutgoingInviteForPlayer([invalid], "4", 10_000), false)
})

test("declined invitation disappears from the sender screen immediately", () => {
  const declined = {inviteId: "declined", status: "declined", respondedAt: 10_000, toId: "2"}

  assert.deepEqual(getVisibleOutgoingInvites([declined], 10_000), [])
})

test("declined invitation stays visible in the party roster for five seconds", () => {
  const declined = {inviteId: "declined", status: "declined", respondedAt: 10_000, toId: "2"}

  assert.deepEqual(getVisiblePartyOutgoingInvites([declined], 14_999), [declined])
  assert.deepEqual(getVisiblePartyOutgoingInvites([declined], 15_000), [])
  assert.equal(OUTGOING_DECLINED_DISPLAY_MS, 5_000)
})

test("refresh keeps a recent decline visible instead of causing a roster flicker", () => {
  const declined = {inviteId: "declined", status: "declined", respondedAt: 10_000, toId: "2"}
  const pending = {inviteId: "pending", status: "pending", toId: "3", expiresAt: 30_000}

  assert.deepEqual(
    mergeOutgoingInvitesAfterRefresh([declined], [pending], 12_000),
    [pending, declined],
  )
  assert.deepEqual(mergeOutgoingInvitesAfterRefresh([declined], [], 15_000), [])
})

test("refresh cannot roll a resolved invitation back to pending", () => {
  const declined = {inviteId: "declined", status: "declined", respondedAt: 10_000, toId: "2"}
  const stalePending = {inviteId: "declined", status: "pending", expiresAt: 300_000, toId: "2"}

  assert.deepEqual(
    mergeOutgoingInvitesAfterRefresh([], [stalePending], 12_000, [declined]),
    [declined],
  )
})

test("invite updates are monotonic and ignore duplicate terminal events", () => {
  const pending = {inviteId: "invite", status: "pending", createdAt: 1_000}
  const declined = {inviteId: "invite", status: "declined", createdAt: 1_000, respondedAt: 2_000}

  assert.equal(shouldAcceptInviteUpdate(pending, declined), true)
  assert.equal(shouldAcceptInviteUpdate(declined, declined), false)
  assert.equal(shouldAcceptInviteUpdate(declined, pending), false)
})

test("invalid outgoing invitation remains visible for ten seconds", () => {
  const invalid = {inviteId: "invalid", status: "invalid", invalidReason: "canceled", respondedAt: 10_000, toId: "2"}

  assert.equal(getVisibleOutgoingInvites([invalid], 19_999).length, 1)
  assert.equal(getVisibleOutgoingInvites([invalid], 20_000).length, 0)
})

test("incoming invite status replaces the existing outgoing state", () => {
  const merged = mergeOutgoingInvites(
    [{inviteId: "invite-1", status: "pending", toId: "2"}],
    {inviteId: "invite-1", status: "declined", respondedAt: 12_000, toId: "2"},
  )

  assert.deepEqual(merged, [{inviteId: "invite-1", status: "declined", respondedAt: 12_000, toId: "2"}])
})

test("pending invite expires from the visible outgoing model after five minutes", () => {
  const invite = {inviteId: "pending", status: "pending", createdAt: 1_000, expiresAt: 301_000}

  assert.deepEqual(getVisibleOutgoingInvites([invite], 300_999), [invite])
  assert.deepEqual(getVisibleOutgoingInvites([invite], 301_000), [])
})

test("invite progress counts down from a full circle", () => {
  const invite = {createdAt: 1_000, expiresAt: 11_000}

  assert.equal(getInviteRemainingSeconds(invite, 1_000), 10)
  assert.equal(getInviteRemainingSeconds(invite, 6_000), 5)
  assert.equal(getInviteProgress(invite, 6_000), 50)
})

test("acceptance screen hides invalid history while party screen shows it for ten seconds", () => {
  const invalid = {inviteId: "invalid", status: "invalid", invalidReason: "canceled", respondedAt: 10_000}
  const expired = {inviteId: "expired", status: "pending", expiresAt: 10_000}

  assert.deepEqual(getVisibleIncomingInvites([invalid, expired], 15_000), [])
  assert.deepEqual(getVisiblePartyInvites([invalid], 19_999), [invalid])
  assert.deepEqual(getVisiblePartyInvites([invalid], 20_000), [])
})

test("toast notification lifetime is fifteen seconds and does not define invite lifetime", () => {
  assert.equal(INVITE_NOTIFICATION_DISPLAY_MS, 15_000)
  assert.equal(INVITE_INVALID_DISPLAY_MS, 10_000)
})

test("notification loader tracks the fifteen-second toast lifetime", () => {
  const deadline = 20_000

  assert.equal(getNotificationProgress(deadline, 5_000), 100)
  assert.equal(getNotificationProgress(deadline, 12_500), 50)
  assert.equal(getNotificationProgress(deadline, 20_000), 0)
})

test("invalid notifications use a five-second lifetime and loader", () => {
  assert.equal(INVITE_INVALID_NOTIFICATION_DISPLAY_MS, 5_000)
  assert.equal(getInviteNotificationDisplayMs({status: "pending"}), INVITE_NOTIFICATION_DISPLAY_MS)
  assert.equal(getInviteNotificationDisplayMs({status: "invalid"}), INVITE_INVALID_NOTIFICATION_DISPLAY_MS)
  assert.equal(getNotificationProgress(5_000, 2_500, INVITE_INVALID_NOTIFICATION_DISPLAY_MS), 50)
})

test("dismissing a notification hides it before the decline request completes", async () => {
  let releaseDecline
  let hidden = false
  const decline = new Promise(resolve => { releaseDecline = resolve })
  const dismissal = dismissInviteNotification({
    invite: {inviteId: "invite-1", status: "pending"},
    hide: () => { hidden = true },
    decline: () => decline,
  })

  assert.equal(hidden, true)
  releaseDecline()
  await dismissal
})
