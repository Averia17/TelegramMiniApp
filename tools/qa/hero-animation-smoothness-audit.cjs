const path = require("node:path")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.HERO_SMOOTHNESS_QA_URL || "http://127.0.0.1:5173"
const heroes = (process.env.HERO_SMOOTHNESS_QA_HEROES || "Mandy,Kaze,Wukong Mico,Needle,Fairy Mina,Persephone Lumi,Brock Zeus,Katty").split(",")

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    const errors = []
    const results = []
    for (const hero of heroes) {
      const page = await browser.newPage({viewport: {width: 1100, height: 900}, deviceScaleFactor: 1})
      page.on("console", message => { if (message.type() === "error") errors.push(`${hero}: ${message.text()}`) })
      page.on("pageerror", error => errors.push(`${hero}: ${error.stack || error}`))
      try {
        await page.route("**/api/battle/heroes", route => route.fulfill({json: [{name: hero}]}))
        await page.route("**/api/battle/map-preview", route => route.fulfill({json: {map: {width: 1024, height: 768, tileSize: 40, walls: []}}}))
        await page.goto(`${baseUrl}/test/glb-hero-harness?hero=${encodeURIComponent(hero)}`, {waitUntil: "domcontentloaded", timeout: 30000})
        await page.waitForFunction(() => Boolean(window.qa?.getView()?.animation), {timeout: 30000})
        const result = await page.evaluate(() => {
          const controller = window.qa.getView().animation
          const interpolation = {}
          const boneNames = new Set()
          controller.root.traverse(node => { if (node.isBone) boneNames.add(node.name) })
          for (const [name, action] of controller.actions) {
            const counts = {}
            const boneCounts = {}
            for (const track of action.getClip().tracks) {
              const interpolant = track.createInterpolant()
              const kind = interpolant.constructor?.name || "unknown"
              counts[kind] = (counts[kind] || 0) + 1
              const nodeName = track.name.slice(0, track.name.lastIndexOf("."))
              if (boneNames.has(nodeName)) boneCounts[kind] = (boneCounts[kind] || 0) + 1
            }
            const discreteSamples = action.getClip().tracks
              .filter(track => (track.createInterpolant().constructor?.name || "unknown") === "DiscreteInterpolant")
              .slice(0, 12)
              .map(track => ({name: track.name, valueType: track.ValueTypeName, times: track.times.length}))
            const boneSamples = action.getClip().tracks
              .filter(track => boneNames.has(track.name.slice(0, track.name.lastIndexOf("."))))
              .slice(0, 20)
              .map(track => ({
                name: track.name,
                valueType: track.ValueTypeName,
                interpolant: track.createInterpolant().constructor?.name || "unknown",
                times: [...track.times],
                first: [...track.values].slice(0, track.getValueSize()),
                last: [...track.values].slice(-track.getValueSize()),
              }))
            interpolation[name] = {
              duration: action.getClip().duration,
              tracks: action.getClip().tracks.length,
              interpolants: counts,
              boneInterpolants: boneCounts,
              discreteSamples,
              boneSamples,
            }
          }
          const bones = []
          controller.root.traverse(node => {
            if (node.isBone && /(^|[_:])(?:head|hips?|pelvis|left.?hand|right.?hand|left.?foot|right.?foot)([_:]|$)/i.test(node.name)) bones.push(node.name)
          })
          return {interpolation, bones}
        })
        results.push({hero, ...result})
      } catch (error) {
        errors.push(`${hero}: ${error.stack || error}`)
      } finally {
        await page.close()
      }
    }
    console.log(JSON.stringify({heroes: heroes.length, errors, results}, null, 2))
    if (errors.length) process.exitCode = 1
  },
  {maxRuntimeMs: 180000},
).catch(error => {
  console.error(error)
  process.exitCode = 1
})
