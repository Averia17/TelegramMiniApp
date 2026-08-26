const assert = require("node:assert/strict")
const { chromium } = require("../../frontend/node_modules/playwright")
const { launchHeadlessChromium, runWithBrowser } = require("./playwright-runner.cjs")

const baseUrl = process.env.BROCK_ZEUS_QA_URL || "http://localhost:5173"

runWithBrowser(
  () => launchHeadlessChromium(chromium, { headless: true }),
  async browser => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const pageErrors = []
    page.on("pageerror", error => pageErrors.push(error.stack || String(error)))
    await page.goto(`${baseUrl}/test/glb-hero-harness.html?hero=Brock+Zeus`, { waitUntil: "domcontentloaded", timeout: 30000 })
    const result = await page.evaluate(async () => {
      const { GLTFLoader } = await import("/node_modules/three/examples/jsm/loaders/GLTFLoader.js")
      const load = async url => {
        const buffer = await fetch(url).then(response => response.arrayBuffer())
        return new Promise((resolve, reject) => {
          new GLTFLoader().parse(buffer, "/", gltf => {
            const nodes = []
            gltf.scene.traverse(object => nodes.push({ name: object.name, type: object.type }))
            resolve({
              nodes: nodes.length,
              animations: gltf.animations.map(clip => ({ name: clip.name, duration: clip.duration })),
              hasCloud: nodes.some(node => node.name === "Cloud"),
            })
          }, reject)
        })
      }
      return {
        hero: await load("/assets/heroes/output_heroes/brock-zeus_base.glb"),
        cloud: await load("/assets/heroes/output_heroes/brock-zeus_cloud.glb"),
        harness: window.render_game_to_text(),
      }
    })
    assert.equal(pageErrors.length, 0, pageErrors.join("\n"))
    assert.equal(result.hero.hasCloud, false)
    assert.equal(result.cloud.hasCloud, true)
    assert.ok(result.hero.animations.some(clip => clip.name === "idle"))
    assert.ok(result.cloud.animations.some(clip => clip.name === "Cloud_root_idle"))
    await page.screenshot({ path: "artifacts/brock-zeus-archive-rebuild/harness-brock-zeus.png" })
    console.log(JSON.stringify({ result, pageErrors }))
  },
)
