import test from "node:test"
import assert from "node:assert/strict"
import {getTauntPurchaseState} from "../src/components/Tabs/storeEconomy.js"

test("daily taunt access is available when the wallet has enough crystals", () => {
  assert.deepEqual(
    getTauntPurchaseState({crystals: 10, taunt_pack_cost: 10, taunt_pack_charges: 10}),
    {
      cost: 10,
      canBuy: true,
      disabled: false,
      buttonLabel: "КУПИТЬ НА ДЕНЬ",
      title: "Купить насмешку на 24 часа",
    },
  )
})

test("taunt pack explains how many crystals are missing", () => {
  const state = getTauntPurchaseState({crystals: 3, taunt_pack_cost: 10})

  assert.equal(state.disabled, true)
  assert.equal(state.buttonLabel, "НУЖНО ЕЩЁ 7")
  assert.equal(state.title, "Нужно 10 кристаллов")
})
