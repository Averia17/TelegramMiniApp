import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"
import test from "node:test"

const read = file => readFile(new URL(`../${file}`, import.meta.url), "utf8")

test("profile nickname editor saves through the account API", async () => {
  const source = await read("src/components/Tabs/ProfileTab.jsx")

  assert.match(source, /axios\.patch\(`\$\{API_URL\}\/users\/me\/nickname`/)
  assert.match(source, /\{nickname: nicknameDraft\}/)
  assert.match(source, /account\.nickname \|\| account\.full_name/)
  assert.match(source, /maxLength=\{20\}/)
  assert.match(source, /Ник нельзя сделать длиннее 20 символов/)
  assert.match(source, /if \(nicknameDraft\.length > 20\)/)
})

test("nickname edit control lives beside the profile nickname", async () => {
  const source = await read("src/components/Tabs/ProfileTab.jsx")

  assert.match(source, /<div className="bs-identity">[\s\S]*className="bs-nickname-line"/)
  assert.match(source, /className="bs-nickname-button"/)
  assert.doesNotMatch(source, /<div className="bs-nickname-editor">/)
})

test("battle receives the saved nickname from the landing page", async () => {
  const appSource = await read("src/App.jsx")
  const landingSource = await read("src/pages/landing-page.jsx")
  const battleSource = await read("src/components/BattleGame/BattleGame.jsx")

  assert.match(landingSource, /playerName: nickname/)
  assert.match(appSource, /playerName=\{playerName\}/)
  assert.match(battleSource, /configuredPlayerName\.trim\(\)/)
  assert.doesNotMatch(landingSource, /const playerTag = `P\$/)
  assert.doesNotMatch(battleSource, /`P\$\{String\(effectivePlayerId\)/)
  assert.doesNotMatch(await read("src/components/Tabs/ProfileTab.jsx"), /БОЕЦ \$\{id\}/)
})

test("party search sends a free-form query for either nickname or id", async () => {
  const partySource = await read("src/components/Party/PartyPanel.jsx")

  assert.match(partySource, /placeholder="Ник или ID игрока"/)
  assert.match(partySource, /\/search\?query=/)
  assert.doesNotMatch(partySource, /inputMode="numeric"/)
})
