import {useEffect, useRef, useState} from "react"
import "./katty-lab.css"

const anglePresets = [
  {id:"front",label:"FRONT",yaw:0,pitch:.04},
  {id:"three-quarter",label:"3/4",yaw:.62,pitch:.04},
  {id:"side",label:"SIDE",yaw:1.28,pitch:.04},
  {id:"back",label:"BACK",yaw:Math.PI,pitch:.04},
]

export default function KattyLab() {
  const [angle, setAngle] = useState(anglePresets[1])
  const [compareMode, setCompareMode] = useState("split")
  const [overlaySplit, setOverlaySplit] = useState(50)
  const [abTarget, setAbTarget] = useState("mandy")
  const sceneApi = useRef(null)

  useEffect(() => {
    let cancelled = false
    let cleanup = () => {}
    import("../components/KattyLabScene.js").then(({mountKattyLab}) => {
      if (cancelled) return
      cleanup = mountKattyLab({
        referenceElement: document.querySelector("#mandy-reference-canvas"),
        proceduralElement: document.querySelector("#katty-procedural-canvas"),
      })
      sceneApi.current = cleanup.api
      sceneApi.current?.setAngle(anglePresets[1])
    })
    return () => { cancelled = true; sceneApi.current = null; cleanup() }
  }, [])

  useEffect(() => { sceneApi.current?.setAngle(angle) }, [angle])

  return (
    <main className="katty-lab">
      <header className="katty-lab__header">
        <div>
          <p className="eyebrow">WEB MODEL STUDY / 01</p>
          <h1>MANDY <span>→</span> KATTY</h1>
          <p className="katty-lab__intro">A browser-built character study. Same silhouette language, new heroine — no Blender runtime asset.</p>
        </div>
        <div className="katty-lab__badge"><span className="status-dot"/> THREE.JS / LIVE</div>
      </header>

      <section style={{"--overlay-split":`${overlaySplit}%`}} className={`katty-lab__stage compare-stage compare-stage--${compareMode} ${compareMode === "ab" ? `compare-stage--ab-${abTarget}` : ""}`} aria-label="Mandy and Katty comparison">
        <div className="model-card model-card--reference">
          <div className="model-card__label"><span>REFERENCE</span><strong>MANDY</strong></div>
          <div className="model-card__canvas" id="mandy-reference-canvas"/>
          <div className="model-card__meta">CURRENT GLB · PBR + ANIMATIONS</div>
        </div>
        <div className="model-card model-card--katty">
          <div className="model-card__label"><span>PROCEDURAL</span><strong>KATTY</strong></div>
          <div className="model-card__canvas" id="katty-procedural-canvas"/>
          <div className="model-card__meta">HTML / CSS / JS · THREE.JS PRIMITIVES</div>
        </div>
        {compareMode === "overlay" && <div className="compare-stage__marker" style={{left:`${overlaySplit}%`}} aria-hidden="true"/>}
      </section>

      <section className="katty-lab__controls">
        <div><p className="eyebrow">CAMERA SHEET</p><h2>Compare every angle</h2></div>
        <div className="katty-lab__tool-stack">
          <div className="angle-switcher" role="group" aria-label="Camera angle">
            {anglePresets.map(preset => <button key={preset.id} className={angle.id === preset.id ? "is-active" : ""} onClick={() => setAngle(preset)}>{preset.label}</button>)}
          </div>
          <div className="compare-switcher" role="group" aria-label="Comparison mode">
            {[["split","SPLIT"],["overlay","OVERLAY"],["ab","A/B"]].map(([id,label]) => <button key={id} className={compareMode === id ? "is-active" : ""} onClick={() => setCompareMode(id)}>{label}</button>)}
          </div>
        </div>
        <div className="katty-lab__compare-panel">
          {compareMode === "overlay" && <label className="compare-slider">KATTY COVERAGE <input aria-label="Katty overlay coverage" type="range" min="10" max="90" value={overlaySplit} onChange={event => setOverlaySplit(Number(event.target.value))}/><span>{overlaySplit}%</span></label>}
          {compareMode === "ab" && <div className="ab-switcher" role="group" aria-label="A/B model">
            <button className={abTarget === "mandy" ? "is-active" : ""} onClick={() => setAbTarget("mandy")}>MANDY</button>
            <button className={abTarget === "katty" ? "is-active" : ""} onClick={() => setAbTarget("katty")}>KATTY</button>
          </div>}
          <div className="katty-lab__note">Drag either model to inspect details. Camera target and distance are shared.</div>
        </div>
      </section>

      <section className="katty-lab__details">
        <div><span>01</span><strong>Face language</strong><p>Oversized oval eyes, sculpted brows and a small expressive mouth preserve the Mandy read.</p></div>
        <div><span>02</span><strong>Costume system</strong><p>Layered hanbok silhouette with cuffs, collar, sash, charms and a readable waist break.</p></div>
        <div><span>03</span><strong>Hero prop</strong><p>Katty’s candy blaster follows Mandy’s diagonal handle, joint and oversized head silhouette.</p></div>
      </section>
    </main>
  )
}
