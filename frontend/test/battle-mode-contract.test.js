import test from "node:test"
import assert from "node:assert/strict"
import {
  createBattleContext,
  createBattleMode,
  DEATHMATCH_MODE,
  TEAM_DEATHMATCH_MODE,
} from "../src/components/BattleGame/battleMode.js"
import {getTeamHudModel, normalizeTeamBattleResult} from "../src/components/BattleGame/teamBattleUi.js"

test("battle mode contract keeps solo targets independent of team metadata", () => {
  const mode = createBattleMode(DEATHMATCH_MODE)
  assert.equal(mode.usesTeams, false)
  assert.equal(mode.areAllies({team: "Red"}, {team: "Red"}), false)
  assert.equal(mode.canDamage({playerId: "a", team: "Red"}, {playerId: "b", team: "Red", lives: 100}), true)
})

test("team mode encapsulates friendly-fire rules", () => {
  const mode = createBattleMode(TEAM_DEATHMATCH_MODE)
  const ally = {playerId: "b", team: "Blue", lives: 100}
  assert.equal(mode.areAllies({team: "Blue"}, ally), true)
  assert.equal(mode.canDamage({playerId: "a", team: "Blue"}, ally), false)
  assert.equal(mode.canDamage({playerId: "a", team: "Blue"}, {...ally, team: "Red"}), true)
})

test("battle context carries mode and authoritative map identity", () => {
  const context = createBattleContext({
    game: {mode: TEAM_DEATHMATCH_MODE},
    map: {id: "team-arena@1", revision: 3, width: 1200, height: 900},
  })
  assert.equal(context.mode.id, TEAM_DEATHMATCH_MODE)
  assert.deepEqual(context.map, {id: "team-arena@1", revision: 3, width: 1200, height: 900})
})

test("team HUD groups living players and marks the local team", () => {
  const state = {game: {mode: TEAM_DEATHMATCH_MODE}, players: {
    local: {playerId: "local", team: "Blue", lives: 100, kills: 2, name: "A"},
    ally: {playerId: "ally", team: "Blue", lives: 0, kills: 1, name: "B"},
    enemy: {playerId: "enemy", team: "Red", lives: 100, kills: 3, name: "C"},
  }}
  const model = getTeamHudModel(state, "local")
  assert.equal(model.localTeam, "Blue")
  assert.deepEqual(model.teams.map(team => [team.id, team.alive, team.kills, team.isLocal]), [
    ["Blue", 1, 3, true], ["Red", 1, 3, false],
  ])
})

test("team result resolves winner team without changing solo result semantics", () => {
  const state = {game: {mode: TEAM_DEATHMATCH_MODE}, players: {
    local: {team: "Red", lives: 100}, enemy: {team: "Blue", lives: 100},
  }}
  const result = normalizeTeamBattleResult({won: false, winner: "Blue team"}, state, "local")
  assert.equal(result.winnerTeam, "Blue")
  assert.equal(result.won, false)
})
