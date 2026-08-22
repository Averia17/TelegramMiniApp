import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

const root = path.resolve(import.meta.dirname, "..")
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8")

test("interactive popover owns outside-click and Escape dismissal", () => {
  const popover = read("src/components/InteractivePopover/InteractivePopover.jsx")
  const partyRoster = read("src/components/Party/PartyRoster.jsx")

  assert.match(popover, /document\.addEventListener\("pointerdown"/)
  assert.match(popover, /event\.key === "Escape"/)
  assert.doesNotMatch(partyRoster, /openNameId|closeNameOverlay/)
  assert.match(partyRoster, /<InteractivePopover/)
})

test("party name popovers only activate when the displayed name overflows", () => {
  const popover = read("src/components/InteractivePopover/InteractivePopover.jsx")
  const partyRoster = read("src/components/Party/PartyRoster.jsx")

  assert.match(popover, /onlyWhenOverflow/)
  assert.match(popover, /scrollWidth\s*>\s*target\.clientWidth/)
  assert.match(partyRoster, /onlyWhenOverflow/)
  assert.match(partyRoster, /data-popover-overflow-target/)
})

test("energy countdown is shown without a regeneration amount prefix", () => {
  const landingPage = read("src/pages/landing-page.jsx")

  assert.doesNotMatch(landingPage, /subvalue=\{economy\.energy < economy\.max_energy \? `\+1 /)
  assert.match(landingPage, /Энергия пополнится через/)
})
