import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

const read = relativePath => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8")

test("document opts into phone safe areas and interactive viewport resizing", () => {
  const html = read("index.html")

  assert.match(html, /width=device-width/)
  assert.match(html, /viewport-fit=cover/)
  assert.match(html, /interactive-widget=resizes-content/)
  assert.match(html, /name="screen-orientation" content="portrait"/)
})

test("application shell owns the full dynamic viewport without horizontal overflow", () => {
  const scss = read("src/scss/main.scss")

  assert.match(scss, /box-sizing:\s*border-box/)
  assert.match(scss, /#root/)
  assert.match(scss, /min-height:\s*100dvh/)
  assert.match(scss, /overflow-x:\s*hidden/)
})

test("lobby has compact phone and short-screen layouts", () => {
  const css = read("src/pages/landing-page.css")

  assert.match(css, /@media\s*\(max-width:\s*360px\)/)
  assert.match(css, /@media\s*\(max-height:\s*700px\)/)
  assert.match(css, /env\(safe-area-inset-left\)/)
  assert.match(css, /env\(safe-area-inset-right\)/)
})

test("play lobby is locked to the viewport instead of exposing a scroll container", () => {
  const css = read("src/pages/landing-page.css")

  assert.match(css, /\.lp-content--play\s*\{[^}]*overflow:\s*hidden;/)
})

test("hero roster rises above the lobby chrome while it is open", () => {
  const css = read("src/components/HeroSelect/HeroSelect.css")

  assert.match(css, /\.hero-select:has\(\.hero-roster\)\s*\{\s*z-index:\s*100/)
})

test("hero previews keep the larger scale on stage and in a party lineup", () => {
  const css = read("src/components/HeroSelect/HeroSelect.css")
  const preview = read("src/components/HeroSelect/HeroModelPreview.jsx")

  assert.match(preview, /model\.scale\.multiplyScalar\(stage \? 1\.28 : 1\.02\)/)
  assert.match(css, /\.hero-party-member \.hero-portrait--party:has\(\.hero-model-canvas\)\s*\{[^}]*transform:scale\(1\.06\)/)
  assert.match(css, /\.hero-party-member \.hero-portrait--party:has\(\.hero-model-canvas\)\s*\{[^}]*transform:scale\(\.98\)/)
})

test("mobile party surfaces stay compact without hiding the hero lineup", () => {
  const roster = read("src/components/Party/PartyRoster.css")
  const rosterComponent = read("src/components/Party/PartyRoster.jsx")
  const popover = read("src/components/InteractivePopover/InteractivePopover.css")
  const panel = read("src/components/Party/PartyPanel.css")

  assert.match(roster, /\.party-roster-widget\{[^}]*top:calc\(72px \+ env\(safe-area-inset-top\)\)/)
  assert.match(roster, /\.party-roster-widget\{[^}]*width:min\(82px,calc\(100% - 76px\)\);padding:4px/)
  assert.match(roster, /\.party-roster-widget__members\{[^}]*display:flex;flex-direction:column/)
  assert.match(roster, /\.party-roster-widget__member:last-child\{grid-column:auto\}/)
  assert.match(roster, /\.party-roster-widget__header div\{display:none\}/)
  assert.match(roster, /\.party-roster-widget__header button\{[^}]*font-size:0/)
  assert.match(roster, /\.party-roster-widget__invites>small\{display:none\}/)
  assert.match(roster, /\.party-roster-widget__name-popover/)
  assert.match(popover, /@media\(hover:hover\) and \(pointer:fine\)/)
  assert.match(popover, /\.interactive-popover\.is-open \.interactive-popover__content/)
  assert.match(roster, /@media\(min-width:521px\)\{\.party-roster-widget\{[^}]*width:min\(240px,calc\(100% - 84px\)\)/)
  assert.match(roster, /@media\(min-width:521px\)[\s\S]*?\.party-roster-widget__members\{display:flex;flex-direction:column/)
  assert.match(rosterComponent, /InteractivePopover/)
  assert.doesNotMatch(rosterComponent, /openNameId|document\.addEventListener\("pointerdown"|event\.key === "Escape"/)
  assert.match(panel, /\.party-panel__card\{[^}]*max-height:min\(84dvh,640px\);padding:18px 14px/)
})

test("battle HUD keeps touch controls in safe areas on narrow and short phones", () => {
  const css = read("src/components/BattleGame/BattleGame.css")

  assert.match(css, /--battle-safe-left:\s*max\(/)
  assert.match(css, /--battle-safe-bottom:\s*max\(/)
  assert.match(css, /--battle-touch-stick-size:\s*clamp\(/)
  assert.match(css, /--battle-action-gap:\s*clamp\(/)
  assert.match(css, /@media\s*\(max-width:\s*360px\)/)
  assert.match(css, /@media\s*\(max-height:\s*700px\)/)
  assert.match(css, /@media\s*\(pointer:\s*coarse\)\s*and\s*\(orientation:\s*landscape\)/)
  assert.match(css, /max-height:\s*clamp\(96px,\s*22vh,\s*160px\)/)
  assert.match(css, /min-width:\s*48px/)
  assert.match(css, /touch-action:\s*none/)
})

test("mobile battle alerts use a reserved notice rail", () => {
  const css = read("src/components/BattleGame/BattleGame.css")

  assert.match(css, /\.network-status-notice\s*\{[\s\S]*?top:\s*calc\(var\(--team-info-top\)\s*\+\s*76px\)/)
  assert.match(css, /\.battle-game--team\s+\.tower-threat-notice\s*\{[\s\S]*?top:\s*calc\(var\(--team-info-top\)\s*\+\s*112px\)/)
  assert.match(css, /max-height:\s*clamp\(96px,\s*20vh,\s*152px\)/)
  assert.match(css, /\.battle-game--team\s+\.tower-threat-notice\s*\{[\s\S]*?animation:\s*none/)
})

test("mobile battle HUD keeps the playfield open with compact persistent layers", () => {
  const css = read("src/components/BattleGame/BattleGame.css")

  assert.match(css, /--battle-team-topbar-stack:\s*44px/)
  assert.match(css, /--battle-team-score-height:\s*24px/)
  assert.match(css, /--battle-team-objective-height:\s*26px/)
  assert.doesNotMatch(css, /battle-mode-pill/)
  assert.match(css, /\.battle-messages\s+div:nth-last-child\(n\s*\+\s*3\)\s*\{\s*display:\s*none/)
  assert.match(css, /\.battle-messages\s+div\s*\{[\s\S]*?font:\s*800\s*9px/)
})

test("battle renderer follows the dynamic visual viewport during rotation", () => {
  const jsx = read("src/components/BattleGame/BattleGame.jsx")

  assert.match(jsx, /visualViewport\?\.height\s*\|\|\s*window\.innerHeight/)
  assert.match(jsx, /--battle-viewport-height/)
  assert.match(jsx, /orientationchange/)
})

test("secondary mobile surfaces constrain dense content", () => {
  const katty = read("src/pages/katty-lab.css")
  const loading = read("src/components/BattleLoading/BattleLoading.css")
  const battle = read("src/components/BattleGame/BattleGame.css")

  assert.match(katty, /max-width:\s*430px/)
  assert.match(katty, /orientation:\s*landscape/)
  assert.match(loading, /max-height:\s*calc\(100dvh\s*-\s*24px\)/)
  assert.match(battle, /\.battle-result-card\s*\{[^}]*max-height:\s*calc\(100dvh\s*-\s*24px\)/s)
})
