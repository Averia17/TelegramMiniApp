import {test} from "node:test"
import assert from "node:assert/strict"
import {existsSync} from "node:fs"
import {readFile} from "node:fs/promises"
import {getHeroAvatarPath, getTeamHudModel, getTeamRespawnSeconds} from "../src/components/BattleGame/teamBattleUi.js"

const avatarNames = [
  ["Needle", "needle"],
  ["Mandy", "mandy"],
  ["Fairy Mina", "fairy-mina"],
  ["Brock Zeus", "brock-zeus"],
  ["Kaze", "kaze"],
  ["Wukong Mico", "wukong-mico"],
  ["Persephone Lumi", "persephone-lumi"],
  ["Katty", "katty"],
]

test("team HUD maps every hero to a static portrait asset", () => {
  for (const [hero, fileName] of avatarNames) {
    assert.equal(getHeroAvatarPath(hero), `/assets/heroes/icons/${fileName}.png`)
  }
})

test("team HUD keeps each member hero and respawn timestamp", () => {
  const model = getTeamHudModel({
    game: {mode: "team deathmatch"},
    players: {
      ally: {playerId: "ally", name: "Ally", hero: "Wukong Mico", team: "Blue", lives: 0, respawnAt: 12_500, kills: 2},
      enemy: {playerId: "enemy", name: "Enemy", hero: "Kaze", team: "Red", lives: 100, respawnAt: 0, kills: 1},
    },
  }, "ally")

  const member = model.teams.find(team => team.id === "Blue").members[0]
  assert.equal(member.hero, "Wukong Mico")
  assert.equal(member.respawnAt, 12_500)
  assert.equal(member.alive, false)
})

test("team HUD keeps concealed enemies in the roster", () => {
  const model = getTeamHudModel({
    game: {mode: "team deathmatch"},
    players: {
      ally: {playerId: "ally", hero: "Needle", team: "Blue", lives: 100, kills: 0},
    },
    teamRoster: [
      {playerId: "ally", name: "Ally", hero: "Needle", team: "Blue", alive: true, respawnAt: 0, kills: 0},
      {playerId: "enemy", name: "Enemy", hero: "Kaze", team: "Red", alive: false, respawnAt: 12_500, kills: 1},
    ],
  }, "ally")

  const enemyTeam = model.teams.find(team => team.id === "Red")
  assert.equal(enemyTeam.members.length, 1)
  assert.equal(enemyTeam.members[0].hero, "Kaze")
  assert.equal(enemyTeam.members[0].alive, false)
})

test("team HUD countdown uses ceil seconds and disappears when the timer expires", () => {
  assert.equal(getTeamRespawnSeconds({alive: false, respawnAt: 12_500}, 10_000), 3)
  assert.equal(getTeamRespawnSeconds({alive: false, respawnAt: 10_000}, 10_000), null)
  assert.equal(getTeamRespawnSeconds({alive: true, respawnAt: 12_500}, 10_000), null)
})

test("all portrait files exist as public PNG assets", async () => {
  const manifest = await readFile(new URL("../src/components/BattleGame/teamBattleUi.js", import.meta.url), "utf8")
  const hud = await readFile(new URL("../src/components/BattleGame/BattleGameUI.jsx", import.meta.url), "utf8")
  const css = await readFile(new URL("../src/components/BattleGame/BattleGame.css", import.meta.url), "utf8")
  assert.match(manifest, /heroAvatarPaths/)
  assert.match(hud, /team-battle-hud__member/)
  assert.match(hud, /getHeroAvatarPath/)
  assert.match(hud, /getTeamRespawnSeconds/)
  assert.match(css, /\.team-battle-hud__avatar\s*\{/)
  assert.match(css, /\.team-battle-hud__respawn\s*\{/)
  for (const [, fileName] of avatarNames) {
    assert.equal(existsSync(new URL(`../public/assets/heroes/icons/${fileName}.png`, import.meta.url)), true, fileName)
  }
})
