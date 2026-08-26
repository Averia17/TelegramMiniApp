import assert from "node:assert/strict"
import test from "node:test"

import {
  COMBAT_PROFILE,
  COMBAT_PROFILE_REVISION,
  COMBAT_PROFILE_SCHEMA_VERSION,
} from "../src/components/BattleGame/combatProfile.generated.js"

test("generated combat profile exposes the versioned active roster", () => {
  assert.equal(COMBAT_PROFILE.schemaVersion, COMBAT_PROFILE_SCHEMA_VERSION)
  assert.equal(COMBAT_PROFILE.profileRevision, COMBAT_PROFILE_REVISION)
  assert.deepEqual(Object.keys(COMBAT_PROFILE.heroes).sort(), [
    "brock-zeus",
    "fairy-mina",
    "katty",
    "kaze",
    "mandy",
    "needle",
    "persephone-lumi",
    "wukong-mico",
  ])
})
