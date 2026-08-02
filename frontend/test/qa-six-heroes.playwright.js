async page => {
  const heroes = ["Fairy Mina", "Brock Zeus", "Kaze", "Wukong Mico", "Damian", "Persephone Lumi"]
  const results = []
  for (const hero of heroes) {
    await page.goto(`http://localhost/test/glb-hero-harness.html?hero=${encodeURIComponent(hero)}&state=attack`)
    await page.waitForFunction(() => window.qa && window.qa.clips.length > 0)
    await page.waitForTimeout(350)
    const attack = JSON.parse(await page.evaluate(() => window.render_game_to_text()))
    await page.evaluate(() => window.qa.triggerSuper())
    await page.waitForTimeout(120)
    const superState = JSON.parse(await page.evaluate(() => window.render_game_to_text()))
    results.push({
      hero,
      clips: attack.clips,
      animation: attack.animation,
      attackOverlay: attack.overlay,
      superOverlay: superState.overlay,
    })
  }
  return results
}
