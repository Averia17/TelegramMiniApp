import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"
import test from "node:test"

test("hero selection cards prioritize the name and show combat distance", async () => {
  const [source, styles] = await Promise.all([
    readFile(new URL("../src/components/HeroSelect/HeroSelect.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/HeroSelect/HeroSelect.css", import.meta.url), "utf8"),
  ])
  const heroCard = source.match(/const HeroCard = [\s\S]*?(?=\nconst HeroPortrait)/)?.[0]

  assert.ok(heroCard, "HeroCard component should be present")
  assert.match(heroCard, /heroDisplay\(hero\)/)
  assert.match(heroCard, /hero-card-combat-type/)
  assert.match(heroCard, /combatType\(hero\)/)
  assert.match(heroCard, /hero-card-check/)
  assert.doesNotMatch(heroCard, /РАНГ|СИЛА|🏆/)
  assert.doesNotMatch(heroCard, /hero-card-(?:rank|trophies)/)
  assert.match(source, /archetype\?\.startsWith\("melee"\).*"БЛИЖНИЙ БОЙ".*"ДАЛЬНИЙ БОЙ"/)
  assert.match(styles, /\.hero-card-footer\s*\{[^}]*flex-direction:\s*column[^}]*justify-content:\s*center/)
  assert.match(styles, /\.hero-card-footer strong\s*\{[^}]*font:[^;}]*14px/)
})
