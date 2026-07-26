import {useEffect, useRef} from "react"
import * as THREE from "three"
import {createHeroModel} from "../BattleGame/rendering/three/HeroModelFactory"
import {assetRegistry} from "../BattleGame/rendering/assets/AssetRegistry"
import {HeroAnimationController} from "../BattleGame/rendering/heroes/HeroAnimationController"
import {disposeObjectTree} from "../BattleGame/rendering/shared/disposal"

export const HeroModelPreview = ({hero, stage = false}) => {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas=canvasRef.current
    if(!canvas||!hero)return
    const width=stage?300:150,height=stage?340:185
    const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:"high-performance"})
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,stage?2:1.35));renderer.setSize(width,height,false)
    renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=stage
    const scene=new THREE.Scene();const camera=new THREE.OrthographicCamera(-2,2,2.35,-2.35,.1,30);camera.position.set(4.5,3.8,7.2);camera.lookAt(0,1.25,0)
    scene.add(new THREE.HemisphereLight(0xcfe8ff,0x41344f,2.5));const key=new THREE.DirectionalLight(0xffffff,4);key.position.set(-3,6,5);key.castShadow=true;scene.add(key);const rim=new THREE.DirectionalLight(hero.color||0x62f3ff,3);rim.position.set(4,3,-4);scene.add(rim)
    let model=createHeroModel(hero.name);model.scale.setScalar(stage?1.16:1.02);scene.add(model)
    let animation=null
    let disposed=false
    if(assetRegistry.hasHero(hero.name)){
      assetRegistry.instantiateHero(hero.name).then(instance=>{
        if(!instance)return
        if(disposed){disposeObjectTree(instance.root);return}
        scene.remove(model);disposeObjectTree(model)
        model=instance.root;model.scale.multiplyScalar(stage?1.16:1.02);scene.add(model)
        animation=new HeroAnimationController(model,instance.animations,instance.asset.clips)
        animation.play("idle")
      }).catch(error=>console.warn(`Could not load hero preview GLB: ${hero.name}`,error))
    }
    const shadow=new THREE.Mesh(new THREE.CircleGeometry(.92,32),new THREE.MeshBasicMaterial({color:0x16203c,transparent:true,opacity:.28,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.02;shadow.scale.y=.38;scene.add(shadow)
    let previous=performance.now()
    let frame;const draw=now=>{const time=now/1000;const delta=Math.min(.05,(now-previous)/1000);previous=now;model.userData.animate?.(time,stage?.16:.06,Math.max(0,Math.sin(time*.8-1.1)*1.7-.7));animation?.update(delta);model.rotation.y=.42+Math.sin(time*.55)*.1;renderer.render(scene,camera);frame=requestAnimationFrame(draw)};frame=requestAnimationFrame(draw)
    return()=>{disposed=true;cancelAnimationFrame(frame);animation?.dispose();disposeObjectTree(scene);renderer.dispose()}
  },[hero,stage])

  return <canvas ref={canvasRef} className="hero-model-canvas" aria-label={`Анимированная 3D-модель ${hero?.name||"героя"}`}/>
}
