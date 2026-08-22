import test from "node:test"
import assert from "node:assert/strict"
import {getTeamMinimapAllies} from "../src/components/BattleGame/minimapMarkers.js"

test("team minimap keeps every living ally regardless of map distance", () => {
  const players = {
    local: {playerId: "local", team: "Blue", x: 100, y: 100, lives: 1000},
    nearby: {playerId: "nearby", team: "Blue", x: 140, y: 100, lives: 900},
    distant: {playerId: "distant", team: "Blue", x: 1900, y: 1400, lives: 800},
    defeated: {playerId: "defeated", team: "Blue", x: 600, y: 500, lives: 0},
    enemy: {playerId: "enemy", team: "Red", x: 1800, y: 1200, lives: 1000},
  }

  assert.deepEqual(
    getTeamMinimapAllies(players, "local"),
    [["nearby", players.nearby], ["distant", players.distant]],
  )
})
