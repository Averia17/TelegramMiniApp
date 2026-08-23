import test from "node:test"
import assert from "node:assert/strict"
import {GameClient} from "../src/components/BattleGame/GameClient.js"

test("ability commands carry a client id for authoritative reconciliation", () => {
  const client = new GameClient("ws://example", "token", () => {})
  client.playerId = "player-1"
  const id = client.ability("primary")
  assert.equal(id, "player-1:1")
  assert.deepEqual(client.pendingAbilities.get(id).slot, "primary")
})

test("an authoritative ability acknowledgement clears the pending command", () => {
  const client = new GameClient("ws://example", "token", () => {})
  client.playerId = "player-1"
  const id = client.ability("secondary")
  client.handleMessage({type: "state", ts: Date.now(), players: {"player-1": {abilityAck: id}}, map: {}})
  assert.equal(client.pendingAbilities.has(id), false)
})

test("taunt commands use the shared clown taunt contract", () => {
  const client = new GameClient("ws://example", "token", () => {})
  const sent = []
  const previousWebSocket = globalThis.WebSocket
  globalThis.WebSocket = {OPEN: 1}
  client.ws = {readyState: 1, send: payload => sent.push(JSON.parse(payload))}

  client.taunt("clown_laugh", "enemy-2")

  globalThis.WebSocket = previousWebSocket
  assert.deepEqual(sent[0].value, {tauntId: "clown_laugh", targetId: "enemy-2"})
  assert.equal(sent[0].type, "taunt")
})

test("party commands use explicit create, join, and leave messages", () => {
  const client = new GameClient("ws://example", "token", () => {})
  const sent = []
  const previousWebSocket = globalThis.WebSocket
  globalThis.WebSocket = {OPEN: 1}
  client.ws = {readyState: 1, send: payload => sent.push(JSON.parse(payload))}

  client.createParty(3, "party-a")
  client.joinParty("party-a", 3)
  client.leaveParty()

  globalThis.WebSocket = previousWebSocket
  assert.deepEqual(sent, [
    {type: "party_create", maxSize: 3, partyId: "party-a"},
    {type: "party_join", partyId: "party-a", maxSize: 3},
    {type: "party_leave"},
  ])
})

test("party battle commands carry the server-issued battle ticket", () => {
  const client = new GameClient("ws://example", "token", () => {})
  const sent = []
  const previousWebSocket = globalThis.WebSocket
  globalThis.WebSocket = {OPEN: 1}
  client.ws = {readyState: 1, send: payload => sent.push(JSON.parse(payload))}

  client.joinParty("party-a", 3, "signed-ticket")
  client.findMatch("Player", "Kaze", {mode: "team deathmatch", partyId: "party-a", partySize: 3, partyTicket: "signed-ticket"})

  globalThis.WebSocket = previousWebSocket
  assert.equal(sent[0].partyTicket, "signed-ticket")
  assert.equal(sent[1].partyTicket, "signed-ticket")
})

test("intentional battle exit sends a leave command before disconnect", () => {
  const client = new GameClient("ws://example", "token", () => {})
  const sent = []
  const previousWebSocket = globalThis.WebSocket
  globalThis.WebSocket = {OPEN: 1}
  client.ws = {readyState: 1, send: payload => sent.push(JSON.parse(payload))}

  client.leaveBattle()

  globalThis.WebSocket = previousWebSocket
  assert.deepEqual(sent, [{type: "leave_battle"}])
})

test("intentional battle exit resolves only after the server confirms cleanup", async () => {
  const client = new GameClient("ws://example", "token", () => {})
  const sent = []
  const previousWebSocket = globalThis.WebSocket
  globalThis.WebSocket = {OPEN: 1}
  client.ws = {readyState: 1, send: payload => sent.push(JSON.parse(payload))}

  const leave = client.leaveBattle()
  let resolved = false
  leave.then(() => { resolved = true })
  await Promise.resolve()
  assert.equal(resolved, false)

  client.handleMessage({type: "battle_left"})
  assert.equal(await leave, true)
  assert.deepEqual(sent, [{type: "leave_battle"}])

  globalThis.WebSocket = previousWebSocket
})

test("clock sync responses estimate clock skew without treating transit as skew", () => {
  const client = new GameClient("ws://example", "token", () => {})
  const sentAt = Date.now()

  client.handleMessage({
    type: "clock_sync",
    params: {clientTs: sentAt, serverTs: sentAt - 50},
  })

  assert.ok(Math.abs(client.clockOffset - 50) < 10)
})

test("stale WebSocket callbacks cannot overwrite a replacement connection", () => {
  const sockets = []
  const received = []
  const previousWebSocket = globalThis.WebSocket

  class FakeWebSocket {
    static OPEN = 1

    constructor() {
      this.readyState = 0
      sockets.push(this)
    }

    send() {}

    close() {
      this.readyState = 3
      this.onclose?.()
    }
  }

  globalThis.WebSocket = FakeWebSocket
  try {
    const client = new GameClient("ws://example", "token", state => received.push(state))
    client.connect()
    const staleSocket = sockets[0]
    staleSocket.onopen()

    client.connect()
    const activeSocket = sockets[1]
    activeSocket.onopen()

    staleSocket.onmessage({data: JSON.stringify({type: "state", ts: 1, players: {old: {x: 1}}})})
    staleSocket.onclose()
    assert.equal(received.length, 0)
    assert.equal(client.ws, activeSocket)
    assert.equal(client.connected, true)

    activeSocket.onmessage({data: JSON.stringify({type: "state", ts: 2, players: {new: {x: 2}}})})
    assert.equal(received.length, 1)
    assert.equal(received[0].players.new.x, 2)

    client.disconnect()
  } finally {
    globalThis.WebSocket = previousWebSocket
  }
})
