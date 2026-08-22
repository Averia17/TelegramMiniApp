import assert from "node:assert/strict"
import test from "node:test"

import {getBattleErrorMessage} from "../src/components/BattleGame/battleErrors.js"
import {GameClient} from "../src/components/BattleGame/GameClient.js"

test("translates known server errors into actionable Russian warnings", () => {
  assert.equal(
    getBattleErrorMessage({kind: "server", message: "Authentication failed"}),
    "Не удалось подтвердить авторизацию. Откройте игру заново.",
  )
  assert.equal(
    getBattleErrorMessage({kind: "server", message: "Room not found"}),
    "Комната боя не найдена. Вернитесь в меню и начните поиск заново.",
  )
  assert.equal(
    getBattleErrorMessage({kind: "server", message: "Party member is already in battle"}),
    "Кто-то из пати ещё находится в бою. Дождитесь выхода участника.",
  )
})

test("reports connection failures instead of leaving the player on the loading screen", () => {
  assert.equal(
    getBattleErrorMessage({kind: "connection_timeout"}),
    "Сервер боя не ответил вовремя. Проверьте интернет и попробуйте ещё раз.",
  )
  assert.equal(
    getBattleErrorMessage({kind: "connection_closed", code: 1006}),
    "Соединение с сервером боя прервано. Проверьте интернет и попробуйте ещё раз.",
  )
})

test("preserves an unknown server error in the warning", () => {
  assert.equal(
    getBattleErrorMessage({kind: "server", message: "Custom battle failure"}),
    "Ошибка входа в бой: Custom battle failure",
  )
})

test("forwards the WebSocket close code so the UI can explain connection failures", () => {
  const previousWebSocket = globalThis.WebSocket
  let socket
  let closeEvent
  class FakeWebSocket {
    constructor() {
      socket = this
      this.readyState = 0
    }

    close() {}
  }

  globalThis.WebSocket = FakeWebSocket
  try {
    const client = new GameClient("ws://example", "token", () => {}, () => {}, () => {}, event => { closeEvent = event })
    client.connect()
    socket.onclose({code: 1006})
    assert.equal(closeEvent.code, 1006)
  } finally {
    globalThis.WebSocket = previousWebSocket
  }
})
