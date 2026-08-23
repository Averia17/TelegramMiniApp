const fs = require("node:fs")
const path = require("node:path")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.HERO_SKILL_QA_URL || "http://localhost"
const output = path.resolve(__dirname, "../../output/playwright/hero-effect-visual-audit")
const slug = value => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
const heroes = {
  Needle: [
    ["basic", "needle_spores"], ["super-telegraph", "needle_root_telegraph"], ["super-zone", "needle_root_active"],
    ["gadget-dash", "needle_spore_dash"], ["gadget-zone", "needle_spore_cloud"], ["feedback-pull", "needle_root_pull"],
    ["feedback-burst", "needle_root_burst"], ["feedback-anti-heal", "needle_anti_heal"], ["feedback-stun", "needle_spore_stun"],
    ["cast", "needle_root_cast"], ["reserve", "needle_moisture_reserve"],
  ],
  Mandy: [["basic", "mandy_staff_swing"], ["damage-contact", "damage"], ["super-charge", "mandy_super_charge"], ["super-wave", "mandy_super_wave"], ["gadget", "mandy_stance"]],
  "Fairy Mina": [["basic-mark", "mina_mark_burst"], ["mark-break", "mina_mark_break"], ["super", "mina_healing_aura"], ["gadget", "mina_air_wave"]],
  "Brock Zeus": [
    ["basic-beam", "zeus_beam_hole"], ["super-warning", "zeus_strike_warning"], ["super-target", "zeus_storm_target"],
    ["super-strike", "zeus_lightning_strike"], ["super-blast", "zeus_lightning_blast"], ["gadget-fire", "zeus_fire_ground"],
    ["brand", "zeus_thunderbrand"], ["lightning", "lightning"],
  ],
  Kaze: [["basic", "kaze_cross_slash"], ["super", "kaze_dash"], ["gadget", "kaze_veil_step"], ["followup", "kaze_followup_ready"]],
  "Wukong Mico": [
    ["basic", "mico_staff_swing"], ["super-leap", "mico_leap"], ["super-spin", "mico_staff_spin"],
    ["gadget-bind", "mico_ruyi_bind"], ["gadget-rage", "mico_suppressed_rage"], ["gadget-burst", "mico_armor_burst"], ["impact", "mico_skyfall"],
  ],
  "Persephone Lumi": [["basic-zone", "lumi_flower"], ["super", "lumi_roots"], ["gadget", "lumi_seedburst"], ["feedback", "lumi_root_impact"]],
  Katty: [
    ["basic-spray", "katty_paint_spray"], ["basic-cloud", "katty_paint_cloud"], ["super", "katty_paint_puddle"],
    ["gadget-trail", "katty_paint_trail"], ["impact", "katty_paint_impact"], ["mark", "katty_paint_stick"],
  ],
}
const heroColors = {
  "Needle": "#75d947",
  "Mandy": "#ffd84d",
  "Fairy Mina": "#ff9bea",
  "Brock Zeus": "#75d8ff",
  "Kaze": "#a982ff",
  "Wukong Mico": "#ffb33e",
  "Persephone Lumi": "#d8a7ff",
  "Katty": "#ff5c9a",
}
const heroEntries = process.env.HERO_EFFECT_QA_HERO
  ? Object.entries(heroes).filter(([hero]) => hero === process.env.HERO_EFFECT_QA_HERO)
  : Object.entries(heroes)

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true, args: ["--use-gl=swiftshader", "--disable-gpu-sandbox"]}),
  async browser => {
    fs.mkdirSync(output, {recursive: true})
    const results = []
    for (const [hero, skills] of heroEntries) {
      const context = await browser.newContext({viewport: {width: 1100, height: 900}, deviceScaleFactor: 1})
      const page = await context.newPage()
      await page.goto(`${baseUrl}/test/glb-hero-harness?hero=${encodeURIComponent(hero)}`, {waitUntil: "domcontentloaded", timeout: 30000})
      await page.waitForFunction(() => document.querySelector("#status")?.classList.contains("ready"), {timeout: 30000})
      await page.waitForTimeout(260)
      await page.evaluate(() => {
        window.qa.player.x = 360
        window.qa.player.y = 280
        window.qa.battleState.effects = []
        window.qa.battleRenderer.setState(window.qa.battleState)
      })
      for (const [skill, kind] of skills) {
        const effect = {
          id: `${kind}-${skill}`,
          kind,
          x: 360,
          y: 280,
          toX: 680,
          toY: 280,
          radius: skill.includes("super") ? 180 : 90,
          range: skill.includes("basic") ? 140 : 280,
          angle: 0,
          arc: .9,
          color: heroColors[hero],
          maxLife: skill.includes("super") ? 4 : 1.2,
          phase: ["zeus_strike_warning", "needle_root_telegraph", "mandy_super_charge"].includes(kind)
            ? "telegraph"
            : [
              "needle_root_active", "needle_spore_cloud", "needle_spores", "mina_healing_aura", "zeus_storm_target",
              "zeus_fire_ground", "kaze_veil_step", "kaze_followup_ready", "mico_staff_spin", "mico_ruyi_bind",
              "mico_suppressed_rage", "lumi_flower", "lumi_roots", "katty_paint_cloud", "katty_paint_puddle",
              "katty_paint_trail", "needle_root_cast", "needle_moisture_reserve",
            ].includes(kind)
              ? "active"
              : [
                "mina_mark_burst", "mina_mark_break", "needle_root_pull", "needle_root_burst", "needle_anti_heal",
              "needle_spore_stun", "zeus_lightning_strike", "zeus_lightning_blast", "kaze_cross_slash", "mico_skyfall", "mico_armor_burst", "damage",
                "lumi_seedburst", "lumi_root_impact", "katty_paint_impact", "katty_paint_stick",
              ].includes(kind)
                ? "impact"
                : "cast",
        }
        effect.life = effect.maxLife
        await page.evaluate(effect => {
          window.qa.battleState.effects = [effect]
          window.qa.battleRenderer.setState(window.qa.battleState)
          window.qa.battleRenderer.render()
        }, effect)
        await page.waitForTimeout(70)
        const screenshot = path.join(output, `${slug(hero)}-${skill}-${kind}.png`)
        await page.locator("canvas").screenshot({path: screenshot})
        const roles = await page.evaluate(() => {
          const renderer = window.qa.battleRenderer.impl || window.qa.battleRenderer
          const mesh = renderer.effects?.meshes?.values?.().next?.().value
          const found = []
          mesh?.traverse?.(node => { if (node.userData?.role) found.push(node.userData.role) })
          const materials = []
          mesh?.traverse?.(node => {
            if (!node.material) return
            const color = node.material.color
            materials.push({
              role: node.userData?.role || null,
              color: color?.getHexString?.() || null,
              opacity: node.material.opacity,
              visible: node.visible,
              depthTest: node.material.depthTest,
            })
          })
          return {roles: [...new Set(found)], materials, position: mesh?.position?.toArray?.() || null}
        })
        results.push({hero, skill, kind, screenshot, ...roles})
      }
      await context.close()
    }
    fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(results, null, 2))
    console.log(JSON.stringify({output, results}, null, 2))
  },
  {maxRuntimeMs: 600000},
)
