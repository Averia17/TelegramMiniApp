import test from "node:test"
import assert from "node:assert/strict"
import {
  clearActiveBattle,
  getActiveBattleKey,
  getBattleHistoryPresentation,
  getBattleHistoryKey,
  mergeBattleHistory,
  normalizeActiveBattle,
  normalizeBattleHistory,
  readActiveBattle,
  saveActiveBattle,
  sortBattleHistory,
} from "../src/utils/battleHistory.js"
import {getBattleResumeRoute} from "../src/utils/battlePreferences.js"

test("battle history is scoped to the authenticated player", () => {
  assert.equal(getBattleHistoryKey("42"), "battle_history:42")
  assert.equal(getBattleHistoryKey(), "battle_history:anonymous")
})

test("battle history sorts newest first and keeps useful match metadata", () => {
  const history = normalizeBattleHistory([
    {
      won: true,
      finishedAt: "2026-08-20T10:00:00.000Z",
      mode: "team deathmatch",
      mapName: "team-battle",
      partyMembers: [{name: "Луна"}],
      kills: 4,
      deaths: 1,
    },
    {
      won: false,
      finishedAt: "2026-08-21T10:00:00.000Z",
      mode: "deathmatch",
      mapName: "battle-royale",
      kills: 1,
    },
  ])

  assert.equal(sortBattleHistory(history)[0].won, false)
  assert.equal(history[0].mode, "team deathmatch")
  assert.equal(history[0].mapName, "team-battle")
  assert.deepEqual(history[0].partyMembers, [{name: "Луна"}])
})

test("malformed local history is ignored instead of breaking the profile", () => {
  assert.deepEqual(normalizeBattleHistory({broken: true}), [])
  assert.deepEqual(normalizeBattleHistory([{won: true}, null]), [])
})

test("remote history pages merge with local records without duplicates", () => {
  const merged = mergeBattleHistory(
    [{id: "battle-2", finishedAt: "2026-08-21T10:00:00.000Z", won: false}],
    [
      {id: "battle-3", finishedAt: "2026-08-22T10:00:00.000Z", won: true},
      {id: "battle-2", finishedAt: "2026-08-21T10:00:00.000Z", won: false},
    ],
  )
  assert.deepEqual(merged.map(battle => battle.id), ["battle-3", "battle-2"])
})

test("solo history uses placement labels and podium tones", () => {
  assert.deepEqual(getBattleHistoryPresentation({mode: "deathmatch", place: 1}), {
    kind: "placement",
    label: "1 место",
    icon: "✦",
    tone: "gold",
  })
  assert.equal(getBattleHistoryPresentation({mode: "deathmatch", place: 2}).tone, "silver")
  assert.equal(getBattleHistoryPresentation({mode: "deathmatch", place: 3}).tone, "bronze")
  assert.equal(getBattleHistoryPresentation({mode: "deathmatch", place: 7}).tone, "neutral")
})

test("team history keeps win/loss semantics even when legacy data has a place", () => {
  const presentation = getBattleHistoryPresentation({mode: "team deathmatch", place: 1, won: true})
  assert.deepEqual(presentation, {kind: "win", label: "Победа", icon: "✦", tone: ""})
})

test("active battle keeps the room id needed for reconnecting", () => {
  assert.equal(getActiveBattleKey("42"), "battle_active:42")
  assert.deepEqual(normalizeActiveBattle({roomId: "room-7", mode: "team deathmatch", partyId: "party-2"}), {
    roomId: "room-7",
    mode: "team deathmatch",
    partyId: "party-2",
  })
  assert.equal(normalizeActiveBattle({mode: "deathmatch"}), null)
})

test("active battle storage can be cleared after the result is received", () => {
  const previousWindow = globalThis.window
  const values = new Map()
  globalThis.window = {localStorage: {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  }}
  try {
    saveActiveBattle({roomId: "room-8", mode: "deathmatch"}, "42")
    assert.equal(readActiveBattle("42").roomId, "room-8")
    clearActiveBattle("42")
    assert.equal(readActiveBattle("42"), null)
  } finally {
    globalThis.window = previousWindow
  }
})

test("active battle link targets the existing room and preserves team context", () => {
  assert.equal(
    getBattleResumeRoute({roomId: "room/7", mode: "team deathmatch", partyId: "party-2"}),
    "/battle/room%2F7?mode=team&party=party-2",
  )
})
