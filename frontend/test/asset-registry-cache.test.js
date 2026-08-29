import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"
import test from "node:test"
import * as THREE from "three"
import {AssetRegistry} from "../src/components/BattleGame/rendering/assets/AssetRegistry.js"
import {disposeObjectTree} from "../src/components/BattleGame/rendering/shared/disposal.js"

const manifest = {
  TestHero: {
    id: "TestHero",
    url: "/test.glb",
    available: true,
    scale: 1,
    rotationOffset: 0,
    clips: {},
  },
}

const projectFile = relativePath => new URL(`../${relativePath}`, import.meta.url)

test("enables Three.js page-lifetime caching for loaded GLB responses", () => {
  assert.equal(THREE.Cache.enabled, true)
})

test("reuses prepared GLB geometry without disposing it between hero instances", async () => {
  const sourceGeometry = new THREE.BoxGeometry(1, 2, 1)
  let sourceDisposeCalls = 0
  const originalDispose = sourceGeometry.dispose.bind(sourceGeometry)
  sourceGeometry.dispose = () => {
    sourceDisposeCalls += 1
    originalDispose()
  }
  const template = new THREE.Group()
  template.add(new THREE.Mesh(sourceGeometry, new THREE.MeshBasicMaterial()))
  const registry = new AssetRegistry({
    manifest,
    load: async () => ({scene: template, animations: []}),
  })

  const first = await registry.instantiateHero("TestHero")
  const firstGeometry = first.root.children[0].geometry
  disposeObjectTree(first.root)
  const second = registry.instantiateReadyHero("TestHero")

  assert.equal(sourceDisposeCalls, 0)
  assert.equal(second.root.children[0].geometry, firstGeometry)

  disposeObjectTree(second.root)
  sourceGeometry.dispose()
  template.children[0].material.dispose()
})

test("hero roster keeps initialized previews mounted when it is closed", async () => {
  const source = await readFile(projectFile("src/components/HeroSelect/HeroSelect.jsx"), "utf8")
  const styles = await readFile(projectFile("src/components/HeroSelect/HeroSelect.css"), "utf8")
  const preview = await readFile(projectFile("src/components/HeroSelect/HeroModelPreview.jsx"), "utf8")

  assert.match(source, /const \[rosterVisited, setRosterVisited\] = useState\(false\)/)
  assert.match(source, /rosterVisited && \(/)
  assert.match(source, /hero-roster--hidden/)
  assert.match(styles, /\.hero-roster--hidden\s*\{[^}]*visibility\s*:\s*hidden/)
  assert.match(preview, /const \[loaded, setLoaded\] = useState\(false\)/)
  assert.match(preview, /setLoaded\(false\)/)
  assert.match(preview, /aria-busy=\{!loaded\}/)
  assert.match(preview, /hero-model-loader/)
})
