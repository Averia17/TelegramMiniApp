import assert from "node:assert/strict"
import test from "node:test"
import * as THREE from "three"

import {AssetRegistry} from "../src/components/BattleGame/rendering/assets/AssetRegistry.js"
import {GLBHeroController} from "../src/components/BattleGame/rendering/heroes/GLBHeroController.js"
import {getHeroAsset} from "../src/components/BattleGame/rendering/assets/assetManifest.js"
import {getPreviewCameraBounds, getPreviewFitBounds} from "../src/components/HeroSelect/previewCamera.js"

test("front hero previews leave horizontal room for held weapons", () => {
  const bounds = getPreviewCameraBounds({width: 300, height: 340, stage: true})

  assert.ok(bounds.right >= 3.2)
  assert.equal(bounds.left, -bounds.right)
})

test("stage hero previews leave vertical room for Zeus cloud", () => {
  const bounds = getPreviewCameraBounds({width: 300, height: 340, stage: true})

  assert.ok(bounds.top >= 3.4)
  assert.ok(bounds.bottom <= -2.5)
})

test("stage camera fits the loaded hero tightly without clipping its full bounds", () => {
  const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, .1, 30)
  camera.position.set(4.5, 3.8, 7.2)
  camera.lookAt(0, 1.25, 0)

  const hero = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 1), new THREE.MeshBasicMaterial())
  hero.position.y = 1.5
  const bounds = getPreviewFitBounds({camera, object: hero, width: 300, height: 340, padding: 1.16})

  assert.ok(bounds)
  assert.ok(bounds.top - bounds.bottom < 5)
  assert.ok(bounds.right - bounds.left < 5)
  assert.ok(bounds.top > bounds.bottom)
})

test("Brock Zeus preview keeps the hero body centered instead of shifting the whole model", () => {
  const asset = getHeroAsset("Brock Zeus")
  assert.equal(asset.previewOffsetX, 0)
  assert.equal(asset.previewCompanionScale, 1.35)
  assert.equal(asset.previewCompanionOffsetX, -.75)
  assert.equal(asset.previewCompanionOffsetY, -3.6)
})

test("Brock Zeus companion animations keep the stable wrapper as the cloud root", () => {
  const heroRoot = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshBasicMaterial())
  heroRoot.add(body)

  const companionRoot = new THREE.Group()
  companionRoot.name = "Scene"
  const cloudRoot = new THREE.Group()
  cloudRoot.name = "Cloud_Root"
  const cloud = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())
  cloud.name = "Cloud"
  cloudRoot.add(cloud)
  companionRoot.add(cloudRoot)

  const registry = new AssetRegistry({manifest: {
    "Brock Zeus": {
      id: "brock-zeus",
      available: true,
      scale: 1,
      targetHeight: 2.45,
      rotationOffset: 0,
    },
  }})
  const instance = registry.createHeroInstance(
    "Brock Zeus",
    {scene: heroRoot, animations: []},
    {scene: companionRoot, animations: []},
  )
  const controller = new GLBHeroController(instance.root, instance.animations, {}, {
    heroName: "Brock Zeus",
    companionAnimations: instance.companionAnimations,
    spawnOnLoad: false,
  })

  assert.equal(controller.cloud.name, "Cloud")
  assert.equal(controller.cloudRoot.name, "HeroAttachment_Cloud")
  assert.equal(controller.cloudRoot.userData.companionPrepared, true)
  assert.ok(controller.cloudRoot.scale.x > 1)
  assert.equal(cloud.scale.x, 1)
  controller.dispose()
})

test("Brock Zeus companion cloud does not render the hero atlas texture", () => {
  const heroRoot = new THREE.Group()
  heroRoot.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshBasicMaterial()))

  const companionRoot = new THREE.Group()
  const cloud = new THREE.Mesh(
    new THREE.SphereGeometry(1),
    new THREE.MeshStandardMaterial({map: new THREE.Texture()}),
  )
  cloud.name = "Cloud"
  companionRoot.add(cloud)

  const registry = new AssetRegistry({manifest: {
    "Brock Zeus": {
      id: "brock-zeus",
      available: true,
      scale: 1,
      targetHeight: 2.45,
      rotationOffset: 0,
    },
  }})
  const instance = registry.createHeroInstance(
    "Brock Zeus",
    {scene: heroRoot, animations: []},
    {scene: companionRoot, animations: []},
  )
  const renderedCloud = instance.root.getObjectByName("Cloud")

  assert.equal(renderedCloud.material.map, null)
  assert.equal(renderedCloud.material.color.getHex(), 0xc8e7ff)
})
