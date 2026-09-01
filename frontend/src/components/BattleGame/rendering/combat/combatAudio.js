const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

export const COMBAT_AUDIO_BUS_DB = Object.freeze({
  master: -5,
  hit: -7,
  ability: -4,
  danger: -6,
})

export const dbToGain = db => Math.pow(10, Number(db || 0) / 20)

export const getCombatAudioCue = event => {
  if (!event || event.kind !== "hit" || event.accepted === false || event.resolved === false) return null
  const ability = event.abilitySlot && event.abilitySlot !== "basic"
  if (event.reaction === "defeat") return {bus: "ability", startHz: 360, endHz: 92, duration: .18, gain: .18, priority: 3}
  if (ability) return {bus: "ability", startHz: 280, endHz: 120, duration: .12, gain: .12, priority: 2}
  return {bus: "hit", startHz: 190, endHz: 105, duration: .075, gain: .085, priority: 1}
}

const audioContextFactory = () => {
  if (typeof window === "undefined") return null
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  return AudioContextClass ? new AudioContextClass() : null
}

export class CombatAudio {
  constructor({contextFactory = audioContextFactory, enabled = true} = {}) {
    this.contextFactory = contextFactory
    this.enabled = enabled
    this.context = null
    this.buses = new Map()
    this.lastPlayedAt = new Map()
    this.sequence = 0
  }

  ensureContext() {
    if (this.context || !this.enabled) return this.context
    try {
      this.context = this.contextFactory?.() || null
      if (!this.context) return null
      const master = this.context.createGain()
      master.gain.value = dbToGain(COMBAT_AUDIO_BUS_DB.master)
      master.connect(this.context.destination)
      this.buses.set("master", master)
      for (const [name, db] of Object.entries(COMBAT_AUDIO_BUS_DB)) {
        if (name === "master") continue
        const bus = this.context.createGain()
        bus.gain.value = dbToGain(db)
        bus.connect(master)
        this.buses.set(name, bus)
      }
      return this.context
    } catch {
      this.context = null
      return null
    }
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled)
    if (!this.enabled) this.dispose()
  }

  playCombatEvent(event, now = null) {
    const cue = getCombatAudioCue(event)
    if (!cue || !this.enabled) return false
    const context = this.ensureContext()
    if (!context) return false
    const currentTime = Number.isFinite(now) ? now : context.currentTime
    const throttleMs = cue.priority >= 2 ? .07 : .035
    const last = this.lastPlayedAt.get(cue.bus) || -Infinity
    if (currentTime - last < throttleMs) return false
    this.lastPlayedAt.set(cue.bus, currentTime)
    if (context.state === "suspended") {
      const resumed = context.resume?.()
      resumed?.catch?.(() => {})
    }

    const bus = this.buses.get(cue.bus) || this.buses.get("hit")
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const start = context.currentTime
    const duration = cue.duration
    this.sequence++
    const pitchJitter = 1 + ((this.sequence * 17) % 7 - 3) * .012
    oscillator.type = cue.priority >= 2 ? "triangle" : "sine"
    oscillator.frequency.setValueAtTime(cue.startHz * pitchJitter, start)
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, cue.endHz), start + duration)
    gain.gain.setValueAtTime(0.001, start)
    gain.gain.exponentialRampToValueAtTime(clamp(cue.gain, .001, .3), start + .006)
    gain.gain.exponentialRampToValueAtTime(.001, start + duration)
    oscillator.connect(gain)
    gain.connect(bus)
    oscillator.start(start)
    oscillator.stop(start + duration + .015)
    return true
  }

  dispose() {
    this.buses.clear()
    this.lastPlayedAt.clear()
    this.sequence = 0
    const context = this.context
    this.context = null
    const closed = context?.close?.()
    closed?.catch?.(() => {})
  }
}
