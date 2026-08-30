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
