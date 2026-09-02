const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

export const COMBAT_AUDIO_BUS_DB = Object.freeze({
  master: -5,
  hit: -7,
  ability: -4,
  danger: -6,
})

export const dbToGain = db => Math.pow(10, Number(db || 0) / 20)

const DANGER_EFFECT_KINDS = new Set([
  "zeus_strike_warning", "tower_telegraph", "needle_root_telegraph",
  "mandy_super_charge", "kaze_dash_telegraph", "mico_vortex_telegraph",
  "ash_hound_charge_telegraph", "root_guardian_telegraph",
])

export const getCombatAudioCue = event => {
  if (!event || event.accepted === false || event.resolved === false) return null
  if (event.kind === "ability" && event.reason === "accepted") {
    return {bus: "ability", startHz: 320, endHz: 180, duration: .09, gain: .07, priority: 2}
  }
  if (event.kind !== "hit") return null
  const ability = event.abilitySlot && event.abilitySlot !== "basic"
  if (event.reaction === "defeat") return {bus: "ability", startHz: 360, endHz: 92, duration: .18, gain: .18, priority: 3}
  if (ability) return {bus: "ability", startHz: 280, endHz: 120, duration: .12, gain: .12, priority: 2}
  return {bus: "hit", startHz: 190, endHz: 105, duration: .075, gain: .085, priority: 1}
}

export const getCombatEffectCue = effect => {
  if (!effect || !DANGER_EFFECT_KINDS.has(String(effect.kind || ""))) return null
  const guardian = effect.kind === "root_guardian_telegraph"
  return {
    bus: "danger",
    startHz: guardian ? 150 : 230,
    endHz: guardian ? 72 : 110,
    duration: guardian ? .18 : .12,
    gain: guardian ? .11 : .075,
    priority: 2,
  }
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
    this.seenEventIds = new Set()
    this.eventIdOrder = []
    this.seenEffectIds = new Set()
    this.effectIdOrder = []
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
    const id = String(event?.id || "")
    if (id && this.seenEventIds.has(id)) return false
    const played = this.playCue(cue, now)
    if (played && id) {
      this.seenEventIds.add(id)
      this.eventIdOrder.push(id)
      while (this.eventIdOrder.length > 256) {
        this.seenEventIds.delete(this.eventIdOrder.shift())
      }
    }
    return played
  }

  syncEvents(events, now = null) {
    const active = new Set()
    let played = 0
    for (const event of Array.isArray(events) ? events : []) {
      if (!getCombatAudioCue(event)) continue
      const id = String(event.id || "")
      if (id) active.add(id)
      if (this.playCombatEvent(event, now)) played++
    }
    this.seenEventIds.forEach(id => {
      if (!active.has(id)) this.seenEventIds.delete(id)
    })
    this.eventIdOrder = this.eventIdOrder.filter(id => this.seenEventIds.has(id))
    return played
  }

  playCombatEffect(effect, now = null) {
    const cue = getCombatEffectCue(effect)
    if (!cue || !this.enabled) return false
    const id = String(effect.id || "")
    if (id && this.seenEffectIds.has(id)) return false
    const played = this.playCue(cue, now)
    if (played && id) {
      this.seenEffectIds.add(id)
      this.effectIdOrder.push(id)
      while (this.effectIdOrder.length > 256) {
        this.seenEffectIds.delete(this.effectIdOrder.shift())
      }
    }
    return played
  }

  syncEffects(effects, now = null) {
    const active = new Set()
    let played = 0
    for (const effect of Array.isArray(effects) ? effects : []) {
      if (!getCombatEffectCue(effect)) continue
      const id = String(effect.id || "")
      if (id) active.add(id)
      if (this.playCombatEffect(effect, now)) played++
    }
    this.seenEffectIds.forEach(id => {
      if (!active.has(id)) this.seenEffectIds.delete(id)
    })
    this.effectIdOrder = this.effectIdOrder.filter(id => this.seenEffectIds.has(id))
    return played
  }

  playCue(cue, now = null) {
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
    this.seenEventIds.clear()
    this.eventIdOrder = []
    this.seenEffectIds.clear()
    this.effectIdOrder = []
    this.sequence = 0
    const context = this.context
    this.context = null
    const closed = context?.close?.()
    closed?.catch?.(() => {})
  }
}
