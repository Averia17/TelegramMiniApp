const assert = require("node:assert/strict")
const {chromium} = require("../../frontend/node_modules/playwright")
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.BROCK_ZEUS_QA_URL || "http://localhost:5173"

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    const page = await browser.newPage({viewport: {width: 1280, height: 900}})
    const errors = []
    page.on("pageerror", error => errors.push(error.stack || String(error)))
    await page.goto(`${baseUrl}/test/glb-hero-harness.html?hero=Brock+Zeus`, {waitUntil: "domcontentloaded", timeout: 30000})
    await page.waitForFunction(() => Boolean(window.qa?.getView?.()?.animation), {timeout: 30000})
    await page.waitForFunction(() => window.qa.getView().animation.state !== "spawn", {timeout: 5000})
    await page.evaluate(() => window.qa.getView().animation.playOverlay("attack", 0))

    const frames = [1, 4, 8, 9, 12, 13, 15, 18, 24, 30]
    const samples = []
    for (const frame of frames) {
      samples.push(await page.evaluate(async targetFrame => {
        const {Box3, Vector3} = await import("/node_modules/three/build/three.module.js")
        const view = window.qa.getView()
        const controller = view.animation
        const action = controller.actions.get("attack")
        const cloudAction = controller.cloudActions.get("attack")
        const time = ((targetFrame - 1) / 29) * action.getClip().duration
        action.time = time
        cloudAction.time = time
        controller.mixer.update(0)
        controller.cloudMixer?.update(0)
        controller.updateAuthoredCloudEffects()
        const hero = view.model
        const cloud = controller.cloud
        const authoredCloud = controller.root.getObjectByName("Cloud")
        const hand = hero.getObjectByName("R_Hand")
        const box = cloud ? new Box3().setFromObject(cloud) : null
        const heroBox = new Box3().setFromObject(hero)
        const cloudWorld = box && !box.isEmpty() ? box.getCenter(new Vector3()) : cloud?.getWorldPosition(new Vector3())
        const handWorld = hand?.getWorldPosition(new Vector3())
        const rootWorld = controller.root.getWorldPosition(new Vector3())
        const authoredCloudWorld = authoredCloud?.getWorldPosition(new Vector3())
        const authoredCloudBox = authoredCloud ? new Box3().setFromObject(authoredCloud) : null
        const authoredCloudCenter = authoredCloudBox && !authoredCloudBox.isEmpty() ? authoredCloudBox.getCenter(new Vector3()) : null
        const cloudLocal = authoredCloudCenter ? controller.root.worldToLocal(authoredCloudCenter.clone()) : null
        const handLocal = handWorld ? controller.root.worldToLocal(handWorld.clone()) : null
        const parent = cloud?.parent
        const cloudParentLocal = authoredCloudCenter && parent ? parent.worldToLocal(authoredCloudCenter.clone()) : null
        const handParentLocal = handWorld && parent ? parent.worldToLocal(handWorld.clone()) : null
        return {
          frame: targetFrame,
          actionTime: controller.actions.get("attack")?.time || 0,
          actionDuration: controller.actions.get("attack")?.getClip().duration || 0,
          cloudVisible: Boolean(cloud?.visible),
          cloudState: controller.cloudState,
          cloudActionNames: [...controller.cloudActions.keys()],
          cloudActionTime: controller.cloudActions.get("attack")?.time || 0,
          cloudPosition: cloud ? cloud.position.toArray() : null,
          cloudScale: cloud ? cloud.scale.toArray() : null,
          cloudWorld: cloudWorld?.toArray() || null,
          cloudSize: box?.getSize(new Vector3()).toArray() || null,
          heroSize: heroBox.getSize(new Vector3()).toArray(),
          handWorld: handWorld?.toArray() || null,
          cloudToHand: cloudWorld && handWorld ? cloudWorld.distanceTo(handWorld) : null,
          cloudToRoot: cloudWorld && rootWorld ? cloudWorld.distanceTo(rootWorld) : null,
          authoredCloudName: authoredCloud?.name || null,
          authoredCloudPosition: authoredCloud?.position.toArray() || null,
          authoredCloudWorld: authoredCloudWorld?.toArray() || null,
          authoredCloudCenter: authoredCloudCenter?.toArray() || null,
          authoredCloudToHand: authoredCloudWorld && handWorld ? authoredCloudWorld.distanceTo(handWorld) : null,
          authoredCloudCenterToHand: authoredCloudCenter && handWorld ? authoredCloudCenter.distanceTo(handWorld) : null,
          cloudLocal: cloudLocal?.toArray() || null,
          handLocal: handLocal?.toArray() || null,
          localDeltaCloudToHand: cloudLocal && handLocal ? handLocal.sub(cloudLocal).toArray() : null,
          cloudParentLocal: cloudParentLocal?.toArray() || null,
          handParentLocal: handParentLocal?.toArray() || null,
          parentDeltaCloudToHand: cloudParentLocal && handParentLocal ? handParentLocal.sub(cloudParentLocal).toArray() : null,
          lightningVisible: Boolean(controller.cloudLightning?.visible),
          lightningCharge: cloud?.userData?.lightningCharge || 0,
          cloudChildren: cloud ? cloud.children.map(child => ({name: child.name, position: child.position.toArray(), scale: child.scale.toArray()})) : [],
          cloudAttackTracks: controller.cloudActions.get("attack")?.getClip().tracks.map(track => track.name) || [],
          cloudName: cloud?.name || null,
          cloudAttackTrackValues: controller.cloudActions.get("attack")?.getClip().tracks.map(track => ({name: track.name, times: [track.times[0], track.times[track.times.length - 1]], values: [track.values[0], track.values[1], track.values[2], track.values[track.values.length - 3], track.values[track.values.length - 2], track.values[track.values.length - 1]]})) || [],
        }
      }, frame))
    }
    console.log(JSON.stringify({samples, errors}, null, 2))
    assert.equal(errors.length, 0, errors.join("\n"))
    assert.equal(samples.length, frames.length)
    const byFrame = new Map(samples.map(sample => [sample.frame, sample]))
    for (const frame of [4, 8, 9, 12]) {
      assert.ok(byFrame.get(frame).cloudToHand < 0.25, `cloud misses right glove at frame ${frame}`)
    }
    assert.equal(byFrame.get(13).lightningVisible, true)
    assert.equal(byFrame.get(15).lightningVisible, true)
    assert.ok(byFrame.get(18).cloudSize[0] > byFrame.get(8).cloudSize[0] * 8, "cloud does not reform large after release")
  },
).catch(error => {
  console.error(error)
  process.exitCode = 1
})
