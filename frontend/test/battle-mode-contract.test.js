import test from "node:test"
import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"
import {
  createBattleContext,
  createBattleMode,
  DEATHMATCH_MODE,
  TEAM_DEATHMATCH_MODE,
} from "../src/components/BattleGame/battleMode.js"
import {getBattleResultView, isLocalBattleWinner, isLocalPlayerKilled} from "../src/components/BattleGame/battleOutcome.js"
import {getIncomingTowerThreat, getObjectiveHudModel, getTeamHudModel, getTeamObjectiveGroups, getTeamPerspectiveLabel, normalizeTeamBattleResult} from "../src/components/BattleGame/teamBattleUi.js"

const sourceCache = new Map()
const readSource = url => {
  if (!sourceCache.has(url.href)) sourceCache.set(url.href, readFile(url, "utf8"))
  return sourceCache.get(url.href)
}

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

test("team hero presentation clearly separates local, allied, and enemy heroes", async () => {
  const source = await readSource(new URL("../src/components/BattleGame/rendering/heroes/HeroView.js", import.meta.url))
  assert.match(source, /role: "ВРАГ"/)
  assert.match(source, /ring: "#ff334d"/)
  assert.match(source, /role: "СОЮЗНИК"/)
  assert.match(source, /team-marker/)
  assert.match(source, /teamBattle && presentation\.role \? presentation\.color/)
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
  assert.deepEqual(model.teams.map(team => team.label), ["СОЮЗНИКИ", "ПРОТИВНИКИ"])
})

test("team colors stay relative when the local player starts on the authored Red side", () => {
  assert.equal(getTeamPerspectiveLabel("Red", "Red"), "СОЮЗНИКИ")
  assert.equal(getTeamPerspectiveLabel("Blue", "Red"), "ПРОТИВНИКИ")
})

test("team result resolves winner team without changing solo result semantics", () => {
  const state = {game: {mode: TEAM_DEATHMATCH_MODE}, players: {
    local: {team: "Red", lives: 100}, enemy: {team: "Blue", lives: 100},
  }}
  const result = normalizeTeamBattleResult({won: false, winner: "Blue team"}, state, "local")
  assert.equal(result.winnerTeam, "Blue")
  assert.equal(result.won, false)
})

test("team result keeps an authoritative draw and its reason", () => {
  const state = {game: {mode: TEAM_DEATHMATCH_MODE}, players: {
    local: {team: "Red", lives: 100}, enemy: {team: "Blue", lives: 100},
  }}
  const result = normalizeTeamBattleResult({draw: true, winner: "", won: false, reason: "Ничья: у ратуш одинаковое здоровье."}, state, "local")
  assert.equal(result.draw, true)
  assert.equal(result.won, false)
  assert.equal(result.reason, "Ничья: у ратуш одинаковое здоровье.")
})

test("battle outcomes use player ids when display names collide", () => {
  assert.equal(isLocalBattleWinner({winnerId: "winner-2", name: "same"}, "winner-2", "same"), true)
  assert.equal(isLocalBattleWinner({winnerId: "winner-2", name: "same"}, "winner-1", "same"), false)
  assert.equal(isLocalPlayerKilled({killedId: "player-2", killedName: "same"}, "player-1", "same"), false)
  assert.equal(isLocalPlayerKilled({killedName: "same"}, "player-1", "same"), true)
})

test("team defeat opens the result popup instead of the hidden solo death view", () => {
  assert.equal(getBattleResultView({won: false, winner: "Blue team"}, TEAM_DEATHMATCH_MODE), "result")
})

test("solo defeat opens the styled result popup instead of the legacy death view", () => {
  assert.equal(getBattleResultView({won: false, killerName: "A bat"}, "solo"), "result")
})

test("battle result card renders the authoritative result reason", async () => {
  const source = await readSource(new URL("../src/components/BattleGame/BattleGameUI.jsx", import.meta.url))
  assert.match(source, /result\.reason/)
  assert.match(source, /ПРИЧИНА РЕЗУЛЬТАТА/)
})

test("team objective HUD exposes tower and town hall health", () => {
  const objectives = getObjectiveHudModel({game: {mode: TEAM_DEATHMATCH_MODE}, objectives: [
    {id: "red-tower", type: "tower", team: "Red", lives: 0, maxLives: 1000},
    {id: "red-hall", type: "town_hall", team: "Red", lives: 1500, maxLives: 2000},
  ]})
  assert.equal(objectives[0].destroyed, true)
  assert.equal(objectives[1].percent, 75)
})

test("team objective HUD marks a town hall as protected while its tower lives", () => {
  const objectives = getObjectiveHudModel({game: {mode: TEAM_DEATHMATCH_MODE}, objectives: [
    {id: "red-tower", type: "tower", team: "Red", lives: 1000, maxLives: 1000},
    {id: "red-hall", type: "town_hall", team: "Red", lives: 2000, maxLives: 2000},
  ]})
  assert.equal(objectives[1].protected, true)
})

test("team objective HUD keeps the local team column on the left", () => {
  const groups = getTeamObjectiveGroups([
    {id: "blue-tower", type: "tower", team: "Blue", lives: 1000, maxLives: 1000},
    {id: "red-tower", type: "tower", team: "Red", lives: 1000, maxLives: 1000},
  ], "Red")
  assert.deepEqual(groups.map(([team]) => team), ["Red", "Blue"])
})

test("team HUD layers reserve separate vertical slots", async () => {
  const css = await readSource(new URL("../src/components/BattleGame/BattleGame.css", import.meta.url))
  assert.match(css, /--team-score-top:\s*calc\(/)
  assert.match(css, /--team-objective-top:\s*calc\(/)
  assert.match(css, /--team-info-top:\s*calc\(/)
  assert.match(css, /\.team-battle-hud[^}]*top:\s*var\(--team-score-top\)/)
  assert.match(css, /\.team-objective-hud[^}]*top:\s*var\(--team-objective-top\)/)
  assert.match(css, /\.battle-game--team \.battle-player-card,[\s\S]*?\.battle-game--team \.battle-minimap\s*\{\s*top:\s*var\(--team-info-top\)/)
})

test("team HUD exposes the nearest enemy tower threat only inside its real range", () => {
  const state = {game: {mode: TEAM_DEATHMATCH_MODE}, players: {local: {playerId: "local", team: "Blue", x: 400, y: 300, radius: 14}}, objectives: [
    {id: "red-tower", type: "tower", team: "Red", x: 700, y: 300, lives: 1000, attackRange: 320},
  ]}
  assert.equal(getIncomingTowerThreat(state, "local")?.objective.id, "red-tower")
  state.players.local.x = 50
  assert.equal(getIncomingTowerThreat(state, "local"), null)
})

test("team battle UI does not mount the island phase or voice overlays", async () => {
  const source = await readSource(new URL("../src/components/BattleGame/BattleGame.jsx", import.meta.url))
  assert.match(source, /isTeamBattleMode/)
  assert.match(source, /!isTeamBattle && \(\s*<IslandPhaseHud/)
  assert.match(source, /!isTeamBattle && \(\s*<IslandVoiceNotice/)
})

test("team battle renderer disables island hazards", async () => {
  const source = await readSource(new URL("../src/components/BattleGame/rendering/map/MapRenderer.js", import.meta.url))
  assert.match(source, /isTeamBattleMode/)
  assert.match(source, /teamBattle \? "" : game\?\.phase/)
  assert.match(source, /const stormRadius = teamBattle \? 0 : Number\(game\?\.stormRadius\)/)
})

test("team death uses a respawn plate instead of the solo defeat popup", async () => {
  const source = await readSource(new URL("../src/components/BattleGame/BattleGame.jsx", import.meta.url))
  assert.match(source, /team-respawn-overlay/)
  assert.match(source, /ВОЗРОЖДЕНИЕ НА БАЗЕ/)
  assert.match(source, /view === "dead" && !isTeamBattle/)
})

test("room join binds the local player before the first state render", async () => {
  const source = await readSource(new URL("../src/components/BattleGame/BattleGame.jsx", import.meta.url))
  const roomJoinedStart = source.indexOf('if (msg.type === "room_joined")')
  const matchFoundStart = source.indexOf('if (msg.type === "match_found")', roomJoinedStart)
  const roomJoinedBlock = source.slice(roomJoinedStart, matchFoundStart)

  assert.notEqual(roomJoinedStart, -1)
  assert.match(roomJoinedBlock, /const localPlayerId = client\.playerId \|\| msg\.params\?\.playerId/)
  assert.match(roomJoinedBlock, /renderer\.setLocalPlayerId\(localPlayerId\)/)
  assert.match(roomJoinedBlock, /simulation\.setLocalPlayerId\(localPlayerId\)/)
})

test("state updates rebind the local player after an early snapshot race", async () => {
  const battleSource = await readSource(new URL("../src/components/BattleGame/BattleGame.jsx", import.meta.url))
  const stateCallbackStart = battleSource.indexOf("(state) => {")
  const messageCallbackStart = battleSource.indexOf("(msg) => {", stateCallbackStart)
  const stateCallback = battleSource.slice(stateCallbackStart, messageCallbackStart)
  assert.match(stateCallback, /if \(client\.playerId\) \{[\s\S]*renderer\.setLocalPlayerId\(client\.playerId\)[\s\S]*simulation\.setLocalPlayerId\(client\.playerId\)/)

  const rendererSource = await readSource(new URL("../src/components/BattleGame/rendering/three/ThreeBattleRenderer.js", import.meta.url))
  const localIdStart = rendererSource.indexOf("setLocalPlayerId(id)")
  const stateStart = rendererSource.indexOf("setState(state)", localIdStart)
  const localIdBlock = rendererSource.slice(localIdStart, stateStart)
  assert.match(localIdBlock, /this\.players\.forEach/)
  assert.match(localIdBlock, /view\.setLocalPlayer/)
})

test("team minimap marks both bases and highlights the local base", async () => {
  const source = await readSource(new URL("../src/components/BattleGame/BattleGameUI.jsx", import.meta.url))
  assert.match(source, /const localTeam = state\.players\?\[localId\]\?\.team \\|\\| ""/)
  assert.match(source, /objective\.type === "town_hall"/)
  assert.match(source, /mini-base--own/)
})
