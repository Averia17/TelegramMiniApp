import {useEffect, useRef, useState} from "react"
import * as THREE from "three"
import {assetRegistry} from "../BattleGame/rendering/assets/AssetRegistry"
import {GLBHeroController} from "../BattleGame/rendering/heroes/GLBHeroController"
import {disposeObjectTree} from "../BattleGame/rendering/shared/disposal"
import {
  previewRendererCount,
  registerPreviewRenderer,
  unregisterPreviewRenderer,
} from "../BattleGame/rendering/shared/previewContextRegistry.js"

// Mobile browsers commonly cap live WebGL contexts at 8-16. The roster can
// contain more canvases than that, so only the visible leading cards receive a
// renderer. The selected stage preview is always allowed and stays below the
// browser limit together with this small card pool.
const MAX_CARD_PREVIEW_RENDERERS = 6
const previewSnapshots = new Map()

export const HeroModelPreview = ({hero, stage = false}) => {
  const canvasRef = useRef(null)
  const [active, setActive] = useState(stage)
  const [snapshot, setSnapshot] = useState(() => stage ? null : previewSnapshots.get(hero?.name))
  const [loaded, setLoaded] = useState(() => !stage && Boolean(previewSnapshots.get(hero?.name)))

  useEffect(() => {
    const cached = stage ? null : previewSnapshots.get(hero?.name)
    setSnapshot(cached)
    setLoaded(Boolean(cached))
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
    const canvas=canvasRef.current
    if(!canvas||!hero||!active)return
    if(!stage&&previewRendererCount()>=MAX_CARD_PREVIEW_RENDERERS)return
    const width=stage?300:150,height=stage?340:185
    let renderer
    try {
      renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:"high-performance",precision:"mediump"})
      if(renderer.getContext()?.isContextLost()){
        renderer.dispose()
        return
      }
    } catch(error) {
      // A preview is optional. GPU/context exhaustion must never take down the
      // hero-selection page or prevent the battle renderer from mounting.
      console.warn(`Could not create hero preview WebGL context: ${hero.name}`,error)
      return
    }
    registerPreviewRenderer(renderer)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,stage?2:1.35));renderer.setSize(width,height,false)
    renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=stage
    const scene=new THREE.Scene();const camera=new THREE.OrthographicCamera(-2,2,2.35,-2.35,.1,30);camera.position.set(4.5,3.8,7.2);camera.lookAt(0,1.25,0)
    scene.add(new THREE.HemisphereLight(0xcfe8ff,0x41344f,2.5));const key=new THREE.DirectionalLight(0xffffff,4);key.position.set(-3,6,5);key.castShadow=true;scene.add(key);const rim=new THREE.DirectionalLight(hero.color||0x62f3ff,3);rim.position.set(4,3,-4);scene.add(rim)
    let model=new THREE.Group();scene.add(model)
    let animation=null
    let disposed=false
    let snapshotCaptured=Boolean(previewSnapshots.get(hero.name))
    if(assetRegistry.hasHero(hero.name)){
      assetRegistry.instantiateHero(hero.name).then(instance=>{
        if(!instance)return
        if(disposed){disposeObjectTree(instance.root);return}
        scene.remove(model);disposeObjectTree(model)
        model=instance.root;model.scale.multiplyScalar(stage?1.16:1.02);scene.add(model)
        // Lobby previews must appear immediately in Idle. Playing Spawn here caused
        // a cactus/blank flash every time the asynchronous GLB replaced its fallback.
        animation=new GLBHeroController(model,instance.animations,instance.asset.clips,{heroName:hero.name,spawnOnLoad:false})
        setLoaded(true)
      }).catch(error=>console.warn(`Could not load hero preview GLB: ${hero.name}`,error))
    }
    const shadow=new THREE.Mesh(new THREE.CircleGeometry(.92,32),new THREE.MeshBasicMaterial({color:0x16203c,transparent:true,opacity:.28,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.02;shadow.scale.y=.38;scene.add(shadow)
    let previous=performance.now()
    let frame
    const draw=now=>{
      if(disposed||renderer.getContext()?.isContextLost())return
      const time=now/1000
      const delta=Math.min(.05,(now-previous)/1000)
      previous=now
      model.userData.animate?.(time,stage?.16:.06,Math.max(0,Math.sin(time*.8-1.1)*1.7-.7))
      animation?.update(delta,{alive:true,moving:false})
      model.rotation.y=.42+Math.sin(time*.55)*.1
      renderer.render(scene,camera)
      if(!stage&&animation&&!snapshotCaptured){
        snapshotCaptured=true
        try {
          const image=canvas.toDataURL("image/webp",.78)
          previewSnapshots.set(hero.name,image)
          setSnapshot(image)
        } catch {
          // A snapshot is only a perceived-performance fallback.
        }
      }
      frame=requestAnimationFrame(draw)
    }
    frame=requestAnimationFrame(draw)
    return()=>{
      disposed=true
      cancelAnimationFrame(frame)
      animation?.dispose()
      unregisterPreviewRenderer(renderer)
      renderer.setAnimationLoop(null)
      renderer.dispose()
      renderer.forceContextLoss()
      disposeObjectTree(scene)
    }
  },[active,hero,stage])

  return (
    <div className={`hero-model-preview ${loaded ? "" : "hero-model-preview--loading"}`}>
      <canvas
        key={hero?.name}
        ref={canvasRef}
        className="hero-model-canvas"
        style={snapshot ? {backgroundImage:`url(${snapshot})`,backgroundSize:"contain",backgroundPosition:"center",backgroundRepeat:"no-repeat"} : undefined}
        aria-label={`Анимированная 3D-модель ${hero?.name||"героя"}`}
      />
    </div>
  )
}
