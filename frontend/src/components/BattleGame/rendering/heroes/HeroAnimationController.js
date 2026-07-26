import * as THREE from "three"

export class HeroAnimationController {
  constructor(root, clips = [], clipNames = {}) {
    this.mixer = new THREE.AnimationMixer(root)
    this.actions = new Map()
    this.current = null

    for (const [semanticName, clipName] of Object.entries(clipNames)) {
      const clip = THREE.AnimationClip.findByName(clips, clipName)
      if (clip) this.actions.set(semanticName, this.mixer.clipAction(clip))
    }
  }

  play(name, fadeSeconds = 0.16) {
    const next = this.actions.get(name)
    if (!next) return false
    if (this.current === name) return true

    const previous = this.actions.get(this.current)
    next.reset().play()
    if (previous) previous.crossFadeTo(next, fadeSeconds, false)
    this.current = name
    return true
  }

  update(deltaSeconds) {
    this.mixer.update(deltaSeconds)
  }

  dispose() {
    this.mixer.stopAllAction()
    this.mixer.uncacheRoot(this.mixer.getRoot())
    this.actions.clear()
  }
}
