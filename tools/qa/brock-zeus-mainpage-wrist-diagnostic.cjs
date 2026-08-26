const fs = require("node:fs")
const path = require("node:path")
const {chromium} = require("../../frontend/node_modules/playwright")
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.BROCK_ZEUS_QA_URL || "http://localhost"
const output = path.resolve(__dirname, "../../output/playwright/brock-zeus-mainpage-wrist")

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    fs.mkdirSync(output, {recursive: true})
    const page = await browser.newPage({viewport: {width: 435, height: 432}, deviceScaleFactor: 3})
    const errors = []
    page.on("pageerror", error => errors.push(error.stack || String(error)))
    await page.route("**/api/**", async route => {
      const pathname = new URL(route.request().url()).pathname
      if (pathname.endsWith("/auth/telegram")) return route.fulfill({json: {access_token: "qa", user_id: 920000001}})
      if (pathname.endsWith("/economy/me")) return route.fulfill({json: {energy: 100, max_energy: 100, gold: 0, crystals: 0}})
      if (pathname.endsWith("/heroes")) return route.fulfill({json: [{
        name: "Brock Zeus", displayName: "Brock Zeus", rarity: "LEGENDARY", color: "#62f3ff",
        maxLives: 640, speed: 14, attackDamage: 52, title: "QA PREVIEW",
        attackDescription: "Проверка", superDescription: "Проверка", passiveDescription: "Проверка",
        attack: {archetype: "projectile"},
      }]})
      return route.fulfill({json: {}})
    })
    await page.goto(`${baseUrl}/?devUser=920000001`, {waitUntil: "domcontentloaded", timeout: 30000})
    await page.locator(".hero-model-canvas").waitFor({timeout: 30000})
    await page.waitForTimeout(1200)
    await page.screenshot({path: path.join(output, "mainpage.png"), fullPage: true})
    const canvasBox = await page.locator(".hero-model-canvas").boundingBox()
    if (canvasBox) await page.screenshot({path: path.join(output, "mainpage-canvas.png"), clip: canvasBox})

    const report = await page.evaluate(async () => {
      const {AnimationMixer, Box3, Vector3} = await import("/node_modules/three/build/three.module.js")
      const {GLTFLoader} = await import("/node_modules/three/examples/jsm/loaders/GLTFLoader.js")
      const load = url => new Promise((resolve, reject) => {
        fetch(url).then(response => response.arrayBuffer()).then(buffer => {
          new GLTFLoader().parse(buffer, "/", resolve, reject)
        }).catch(reject)
      })
      const gltf = await load("/assets/heroes/output_heroes/brock-zeus_base.glb")
      const root = gltf.scene
      const mixer = new AnimationMixer(root)
      const idle = gltf.animations.find(clip => clip.name === "idle")
      const action = mixer.clipAction(idle)
      action.play()
      mixer.update(0)
      root.updateMatrixWorld(true)
      const names = ["ZeusPart_R_Elbow", "ZeusPart_R_Hand", "ZeusPart_L_Elbow", "ZeusPart_L_Hand"]
      const objects = Object.fromEntries(names.map(name => [name, root.getObjectByName(name)]))
      const bounds = Object.fromEntries(names.map(name => {
        const box = new Box3().setFromObject(objects[name], true)
        return [name, {parent: objects[name]?.parent?.name || null, min: box.min.toArray(), max: box.max.toArray()}]
      }))
      const closest = (a, b) => {
        const left = a.geometry.getAttribute("position")
        const right = b.geometry.getAttribute("position")
        let best = null
        const pointA = new Vector3()
        const pointB = new Vector3()
        for (let i = 0; i < left.count; i += 1) {
          pointA.fromBufferAttribute(left, i).applyMatrix4(a.matrixWorld)
          for (let j = 0; j < right.count; j += 1) {
            pointB.fromBufferAttribute(right, j).applyMatrix4(b.matrixWorld)
            const distance = pointA.distanceTo(pointB)
            if (!best || distance < best.distance) best = {distance, a: pointA.toArray(), b: pointB.toArray()}
          }
        }
        return best
      }
      const {assetRegistry} = await import("/src/components/BattleGame/rendering/assets/AssetRegistry.js")
      const instance = await assetRegistry.instantiateHero("Brock Zeus")
      const {GLBHeroController} = await import("/src/components/BattleGame/rendering/heroes/GLBHeroController.js")
      const controller = new GLBHeroController(instance.root, instance.animations, instance.asset.clips, {
        companionAnimations: instance.companionAnimations,
        heroName: "Brock Zeus",
        previewLayout: true,
        spawnOnLoad: false,
      })
      const animatedSeams = {right: [], left: []}
      for (let frame = 0; frame < 120; frame += 1) {
        controller.update(1 / 30, {alive: true, moving: false})
        instance.root.updateMatrixWorld(true)
        animatedSeams.right.push(closest(instance.root.getObjectByName("ZeusPart_R_Elbow"), instance.root.getObjectByName("ZeusPart_R_Hand")).distance)
        animatedSeams.left.push(closest(instance.root.getObjectByName("ZeusPart_L_Elbow"), instance.root.getObjectByName("ZeusPart_L_Hand")).distance)
      }
      const expectedParts = ["ZeusPart_R_Elbow", "ZeusPart_R_Hand", "ZeusPart_L_Elbow", "ZeusPart_L_Hand"]
      const namedParts = Object.fromEntries(expectedParts.map(name => [name, Boolean(instance.root.getObjectByName(name))]))
      const mergedSkinnedMeshes = []
      instance.root.traverse(node => {
        if (node.isSkinnedMesh && /:merged:/i.test(node.name)) mergedSkinnedMeshes.push(node.name)
      })
      return {
        animations: gltf.animations.map(clip => clip.name),
        objects: Object.fromEntries(names.map(name => [name, {type: objects[name]?.type || null, parent: objects[name]?.parent?.name || null}])),
        bounds,
        seams: {
          right: closest(objects.ZeusPart_R_Elbow, objects.ZeusPart_R_Hand),
          left: closest(objects.ZeusPart_L_Elbow, objects.ZeusPart_L_Hand),
        },
        instance: {
          namedParts,
          mergedSkinnedMeshes,
          animatedSeams: {
            right: {min: Math.min(...animatedSeams.right), max: Math.max(...animatedSeams.right)},
            left: {min: Math.min(...animatedSeams.left), max: Math.max(...animatedSeams.left)},
          },
        },
      }
    })
    if (errors.length) throw new Error(errors.join("\n"))
    for (const [name, present] of Object.entries(report.instance.namedParts)) {
      if (!present) throw new Error(`${name} was merged away in the main-page hero instance`)
    }
    if (report.instance.mergedSkinnedMeshes.length) {
      throw new Error(`Brock Zeus main-page instance contains merged skinned meshes: ${report.instance.mergedSkinnedMeshes.join(", ")}`)
    }
    console.log(JSON.stringify({output, report}, null, 2))
    await page.close()
  },
).catch(error => {
  console.error(error)
  process.exitCode = 1
})
