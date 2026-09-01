import {useEffect, useRef, useState} from "react"
import * as THREE from "three"
import {assetRegistry} from "../BattleGame/rendering/assets/AssetRegistry"
import {GLBHeroController} from "../BattleGame/rendering/heroes/GLBHeroController"
import {disposeObjectTree} from "../BattleGame/rendering/shared/disposal"
import {getPreviewCameraBounds, getPreviewFitBounds} from "./previewCamera.js"
import {
  acquirePreviewSlot,
  registerPreviewRenderer,
  unregisterPreviewRenderer,
} from "../BattleGame/rendering/shared/previewContextRegistry.js"

const MAX_CARD_PREVIEW_RENDERERS = 8

export const HeroModelPreview = ({hero, stage = false}) => {
  const canvasRef = useRef(null)
  const [active, setActive] = useState(stage)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    // Registry readiness means that the GLB is fetched, not that this preview
    // has received and attached its own instance to the canvas yet.
    setLoaded(false)
  }, [hero?.name, stage])

  useEffect(() => {
    if (stage) {
      setActive(true)
      return undefined
    }
    const canvas = canvasRef.current
    if (!canvas || typeof IntersectionObserver === "undefined") {
      setActive(true)
      return undefined
    }
    const observer = new IntersectionObserver(
      entries => setActive(entries.some(entry => entry.isIntersecting)),
      {rootMargin: "80px"},
    )
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [stage])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !hero || !active) return undefined

    let disposed = false
    let disposeRuntime = () => {}
    let releaseSlot = null

    const startPreview = async () => {
      if (!stage) {
        releaseSlot = await acquirePreviewSlot(MAX_CARD_PREVIEW_RENDERERS)
        if (disposed) {
          releaseSlot()
          releaseSlot = null
          return
        }
      }

      const fallbackWidth = stage ? 300 : 150
      const fallbackHeight = stage ? 340 : 185
      let renderer
      try {
        renderer = new THREE.WebGLRenderer({
          canvas,
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
          precision: "mediump",
        })
        if (renderer.getContext()?.isContextLost()) {
          renderer.dispose()
          releaseSlot?.()
          releaseSlot = null
          return
        }
      } catch (error) {
        console.warn(`Could not create hero preview WebGL context: ${hero.name}`, error)
        releaseSlot?.()
        releaseSlot = null
        return
      }

      registerPreviewRenderer(renderer)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, stage ? 2 : 1.35))
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.shadowMap.enabled = stage

      let width = fallbackWidth
      let height = fallbackHeight
      const readCanvasSize = () => {
        width = Math.max(1, canvas.clientWidth || fallbackWidth)
        height = Math.max(1, canvas.clientHeight || fallbackHeight)
        renderer.setSize(width, height, false)
      }
      readCanvasSize()

      const scene = new THREE.Scene()
      let model = new THREE.Group()
      let orientationOffset = 0
      let animation = null
      let runtimeDisposed = false
      let frame
      const cameraBounds = getPreviewCameraBounds({width, height, stage})
      const camera = new THREE.OrthographicCamera(
        cameraBounds.left,
        cameraBounds.right,
        cameraBounds.top,
        cameraBounds.bottom,
        .1,
        30,
      )
      const resizePreview = () => {
        readCanvasSize()
        const nextBounds = getPreviewCameraBounds({width, height, stage})
        Object.assign(camera, nextBounds)
        if (stage && model.children.length) {
          model.updateMatrixWorld(true)
          const fitBounds = getPreviewFitBounds({camera, object: model, width, height})
          if (fitBounds) Object.assign(camera, fitBounds)
        }
        camera.updateProjectionMatrix()
      }
      const resizeObserver = typeof ResizeObserver === "function"
        ? new ResizeObserver(resizePreview)
        : null
      resizeObserver?.observe(canvas)
      camera.position.set(4.5, 3.8, 7.2)
      camera.lookAt(0, 1.25, 0)
      scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x41344f, 2.5))
      const key = new THREE.DirectionalLight(0xffffff, 4)
      key.position.set(-3, 6, 5)
      key.castShadow = true
      scene.add(key)
      const rim = new THREE.DirectionalLight(hero.color || 0x62f3ff, 3)
      rim.position.set(4, 3, -4)
      scene.add(rim)

      scene.add(model)

      disposeRuntime = () => {
        if (runtimeDisposed) return
        runtimeDisposed = true
        cancelAnimationFrame(frame)
        animation?.dispose()
        unregisterPreviewRenderer(renderer)
        resizeObserver?.disconnect()
        renderer.setAnimationLoop(null)
        renderer.dispose()
        renderer.forceContextLoss()
        disposeObjectTree(scene)
        releaseSlot?.()
        releaseSlot = null
      }

      if (assetRegistry.hasHero(hero.name)) {
        const readyInstance = assetRegistry.instantiateReadyHero(hero.name)
        const instancePromise = readyInstance
          ? Promise.resolve(readyInstance)
          : assetRegistry.instantiateHero(hero.name)
        instancePromise.then(instance => {
          if (!instance) return
          if (disposed || runtimeDisposed) {
            disposeObjectTree(instance.root)
            return
          }
          scene.remove(model)
          disposeObjectTree(model)
          model = instance.root
          orientationOffset = instance.asset?.rotationOffset || 0
          model.scale.multiplyScalar(stage ? 1.28 : 1.02)
          model.position.x += instance.asset.previewOffsetX || 0
          if (stage && instance.asset.previewCompanionScale) {
            const companion = model.getObjectByName("HeroAttachment_Cloud")
            companion?.scale.multiplyScalar(instance.asset.previewCompanionScale)
            if (companion && instance.asset.previewCompanionOffsetX) {
              companion.position.x += instance.asset.previewCompanionOffsetX
            }
            if (companion && instance.asset.previewCompanionOffsetY) {
              companion.position.y += instance.asset.previewCompanionOffsetY
            }
          }
          scene.add(model)
          if (stage) {
            model.rotation.y = orientationOffset + .42
            model.updateMatrixWorld(true)
            const fitBounds = getPreviewFitBounds({camera, object: model, width, height})
            if (fitBounds) {
              Object.assign(camera, fitBounds)
              camera.updateProjectionMatrix()
            }
          }
          animation = new GLBHeroController(model, instance.animations, instance.asset.clips, {
            heroName: hero.name,
            spawnOnLoad: false,
            previewLayout: true,
          })
          setLoaded(true)
        }).catch(error => console.warn(`Could not load hero preview GLB: ${hero.name}`, error))
      }

      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(.92, 32),
        new THREE.MeshBasicMaterial({color: 0x16203c, transparent: true, opacity: .28, depthWrite: false}),
      )
      shadow.rotation.x = -Math.PI / 2
      shadow.position.y = .02
      shadow.scale.y = .38
      scene.add(shadow)

      let previous = performance.now()
      const draw = now => {
        if (disposed || runtimeDisposed || renderer.getContext()?.isContextLost()) return
        const time = now / 1000
        const delta = Math.min(.05, (now - previous) / 1000)
        previous = now
        model.userData.animate?.(time, stage ? .16 : .06, Math.max(0, Math.sin(time * .8 - 1.1) * 1.7 - .7))
        animation?.update(delta, {alive: true, moving: false})
        model.rotation.y = orientationOffset + .42 + Math.sin(time * .55) * .1
        renderer.render(scene, camera)
        frame = requestAnimationFrame(draw)
      }
      frame = requestAnimationFrame(draw)
    }

    void startPreview()
    return () => {
      disposed = true
      disposeRuntime()
      releaseSlot?.()
      releaseSlot = null
    }
  }, [active, hero, stage])

  return (
    <div
      className={`hero-model-preview ${loaded ? "" : "hero-model-preview--loading"}`}
      aria-busy={!loaded}
    >
      {!loaded && <span className="hero-model-loader" role="status" aria-label="Загрузка 3D-модели"/>}
      <canvas
        key={hero?.name}
        ref={canvasRef}
        className="hero-model-canvas"
        aria-label={`Анимированная 3D-модель ${hero?.name || "героя"}`}
      />
    </div>
  )
}
