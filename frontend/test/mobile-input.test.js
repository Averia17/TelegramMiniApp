import assert from "node:assert/strict"
import test from "node:test"

import {Input} from "../src/components/BattleGame/Input.js"

const createCanvas = () => {
  const listeners = new Map()
  return {
    style: {},
    listeners,
    addEventListener(type, handler) {
      listeners.set(type, handler)
    },
    getBoundingClientRect() {
      return {left: 0, top: 0, width: 320, height: 568}
    },
  }
}

const createClient = () => ({
  move: () => null,
  rotate: () => null,
  shoot: () => null,
})

test("mobile input does not register keyboard bindings", () => {
  const previousWindow = globalThis.window
  const windowListeners = new Map()
  globalThis.window = {
    matchMedia: () => ({matches: true}),
    addEventListener(type, handler) {
      windowListeners.set(type, handler)
    },
  }

  try {
    const input = new Input(createCanvas(), createClient())

    assert.equal(windowListeners.has("keydown"), false)
    assert.equal(windowListeners.has("keyup"), false)
    input.destroy()
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
})

test("inactive input stops movement and ignores new movement commands", () => {
  const previousWindow = globalThis.window
  const moves = []
  globalThis.window = {
    matchMedia: () => ({matches: true}),
    addEventListener() {},
  }

  try {
    const input = new Input(createCanvas(), {
      move: (x, y) => {
        moves.push([x, y])
        return null
      },
    })

    input.sendMove(1, 0)
    input.setActive(false)
    input.sendMove(1, 0)
    assert.deepEqual(moves, [[1, 0], [0, 0]])

    input.setActive(true)
    input.sendMove(1, 0)
    assert.deepEqual(moves, [[1, 0], [0, 0], [1, 0]])
    input.destroy()
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
})

test("mobile attack input buffers a short recovery tap and sends it when ready", () => {
  const previousWindow = globalThis.window
  const shots = []
  let player = {
    hero: "Kaze", lives: 700, ammo: 2, attackCooldown: 0.12,
    attackRateMs: 600, attackReady: false, x: 100, y: 100,
  }
  globalThis.window = {
    matchMedia: () => ({matches: true}),
    addEventListener() {},
  }

  try {
    const input = new Input(createCanvas(), {
      move: () => null,
      rotate: () => null,
      shoot: (...args) => { shots.push(args); return "shot-1" },
    })
    input.setLocalPlayer("p1", () => ({
      game: {state: "game"},
      players: {p1: player},
    }))
    input.mouseX = 240
    input.mouseY = 280
    input.tryShoot(true)
    assert.equal(shots.length, 0)
    assert.ok(input.pendingAttack)

    player = {...player, attackCooldown: 0, attackReady: true}
    input.lastShotAt = 0
    input.update()
    assert.equal(shots.length, 1)
    assert.equal(input.pendingAttack, null)
    assert.equal(shots[0][2], true)
    input.destroy()
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
})
