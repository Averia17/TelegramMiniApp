import test from "node:test"
import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"

const battleGameSource = await readFile(new URL("../src/components/BattleGame/BattleGame.jsx", import.meta.url), "utf8")

test("BattleGame initializes effectivePlayerId before callbacks that capture it", () => {
  const effectivePlayerIdDeclaration = battleGameSource.indexOf("const effectivePlayerId =")
  const finishBattleDeclaration = battleGameSource.indexOf("const finishBattle = useCallback")

  assert.notEqual(effectivePlayerIdDeclaration, -1, "effectivePlayerId declaration must exist")
  assert.notEqual(finishBattleDeclaration, -1, "finishBattle callback must exist")
  assert.ok(
    effectivePlayerIdDeclaration < finishBattleDeclaration,
    "effectivePlayerId must be initialized before finishBattle captures it",
  )
})
