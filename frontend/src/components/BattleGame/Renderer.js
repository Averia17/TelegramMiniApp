import {ThreeBattleRenderer} from "./rendering/three/ThreeBattleRenderer"

// Stable boundary used by BattleGame and Input. Rendering is intentionally
// Three.js-only so the GLB pipeline has one implementation of every visual.
export class Renderer {
  constructor(canvas) {
    this.impl = new ThreeBattleRenderer(canvas)
  }

  setState(state) { return this.impl.setState(state) }
  setLocalPlayerId(id) { return this.impl.setLocalPlayerId(id) }
  setOutcome(outcome) { return this.impl.setOutcome(outcome) }
  resize(width, height) { return this.impl.resize(width, height) }
  render() { return this.impl.render() }
  worldToScreen(x, y) { return this.impl.worldToScreen(x, y) }
  screenToAimAngle(x, y, player) { return this.impl.screenToAimAngle(x, y, player) }
  isPlayerVisible(id) { return this.impl.isPlayerVisible(id) }
  destroy() { return this.impl.destroy() }
}
