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

test("clock sync responses estimate clock skew without treating transit as skew", () => {
  const client = new GameClient("ws://example", "token", () => {})
  const sentAt = Date.now()

  client.handleMessage({
    type: "clock_sync",
    params: {clientTs: sentAt, serverTs: sentAt - 50},
  })

  assert.ok(Math.abs(client.clockOffset - 50) < 10)
})
