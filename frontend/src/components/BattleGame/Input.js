import {normalizeEightWayMove, quantizeAngleToSectors, worldAngleToProtocolScreen} from "./direction.js"
import {buildAbilityInput, getHeroAbilityInputContract} from "./abilityInputContract.js"
import {triggerTelegramHaptic} from "../../utils/telegramWebApp.js"

const AUTO_AIM_GESTURE_DRAG_LIMIT = 10
const MIN_ATTACK_INPUT_DEBOUNCE_MS = 90
export const ATTACK_INPUT_BUFFER_MS = 140
export const MOBILE_INPUT_MEDIA_QUERY = "(pointer: coarse), (max-width: 700px)"

export const isMobileInputDevice = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia(MOBILE_INPUT_MEDIA_QUERY).matches

export const isAutoAimAttackGesture = (dragDistance) =>
  Number(dragDistance) < AUTO_AIM_GESTURE_DRAG_LIMIT

export const canStartAttack = (player, now, lastShotAt, battleState = "game") => {
  if (battleState !== "game" || !player || Number(player.lives) <= 0 || Number(player.ammo) <= 0) return false
  if (player.attackReady === false) return false
  if (Number(player?.attackCooldown) > 0) return false
  if (Number(player?.stun) > 0 || Number(player?.channel) > 0) return false
  const cadence = Math.max(MIN_ATTACK_INPUT_DEBOUNCE_MS, Number(player?.attackRateMs) || 0)
  return !lastShotAt || Number(now) - Number(lastShotAt) >= cadence
}

export const getKeyboardMoveDirection = keys => {
  let dx = 0
  let dy = 0

  if (keys["KeyW"] || keys["ArrowUp"]) dy -= 1
  if (keys["KeyS"] || keys["ArrowDown"]) dy += 1
  if (keys["KeyA"] || keys["ArrowLeft"]) dx -= 1
  if (keys["KeyD"] || keys["ArrowRight"]) dx += 1

  if (dx !== 0 || dy !== 0) {
    return normalizeEightWayMove(dx, dy)
  }
  return {x: 0, y: 0}
}

export class Input {
  constructor(canvas, gameClient, onTouchControlsChange = null, onMove = null) {
    this.canvas = canvas
    this.canvas.style.touchAction = "none"
    this.client = gameClient
    this.keys = {}
    this.mouseX = 0
    this.mouseY = 0
    this.touchStart = null
    this.touchMove = null
    this.moveTouchId = null
    this.aimTouchId = null
    this.aimStart = null
    this.aimCurrent = null
    this.shooting = false
    this.lastShotAt = 0
    this.pendingAttack = null
    // The battle engine remains authoritative; this timestamp suppresses clicks
    // that its published hero cadence cannot accept yet.
    this.localPlayerId = null
    this.getState = null
    this.getPlayerScreenPosition = null
    this.events = new AbortController()
    this.active = true
    this.keyboardEnabled = !isMobileInputDevice()
    this.lastMoveX = null
    this.lastMoveY = null
    this.lastMoveSentAt = 0
    this.moveSendInterval = 50
    this.lastRotation = null
    this.lastRotationSentAt = 0
    this.rotationSendInterval = 33
    this.attackPointerStart = null
    this.attackAiming = false
    this.onTouchControlsChange = onTouchControlsChange
    this.onMove = onMove

    this.setupKeyboard()
    this.setupMouse()
    this.setupTouch()
  }

  setLocalPlayer(id, stateGetter, screenPositionGetter = null, aimAngleGetter = null) {
    this.localPlayerId = id
    this.getState = typeof stateGetter === "function" ? stateGetter : () => stateGetter
    this.getPlayerScreenPosition = screenPositionGetter
    this.getAimAngleFromScreen = aimAngleGetter
  }

  setActive(active) {
    const nextActive = Boolean(active)
    if (this.active === nextActive) return
    this.active = nextActive
    if (nextActive) return

    this.keys = {}
    this.touchStart = null
    this.touchMove = null
    this.moveTouchId = null
    this.aimTouchId = null
    this.aimStart = null
    this.aimCurrent = null
    this.attackPointerStart = null
    if (this.attackAiming) this.client.setAiming?.(false)
    this.attackAiming = false
    this.sendMove(0, 0)
    this.emitTouchControls()
  }

  resolveAimAngle(screenX, screenY, player, origin) {
    const projected = this.getAimAngleFromScreen?.(screenX, screenY, player)
    if (Number.isFinite(projected)) {
      // CameraRig returns a world-space ray. Convert it to the server protocol
      // before sending rotate/shoot; otherwise the server applies the
      // isometric correction a second time and heroes aim too far vertically.
      return worldAngleToProtocolScreen(quantizeAngleToSectors(projected))
    }
    return quantizeAngleToSectors(Math.atan2(screenY-origin.y, screenX-origin.x))
  }

  resolveAimDistance(screenX, screenY, origin) {
    if (this.aimStart && this.aimCurrent) {
      const displacement = Math.hypot(this.aimCurrent.x-this.aimStart.x, this.aimCurrent.y-this.aimStart.y)
      return Math.min(1, displacement/70)*620
    }
    return Math.hypot(screenX-origin.x, screenY-origin.y)
  }

  getAimOrigin(rect, player) {
    const position = player && this.getPlayerScreenPosition?.(player)
    return Number.isFinite(position?.x) && Number.isFinite(position?.y)
      ? position
      : {x: rect.width / 2, y: rect.height / 2}
  }

  getAttackContext() {
    const state = this.getState?.()
    return {
      state,
      player: this.localPlayerId ? state?.players?.[this.localPlayerId] : null,
    }
  }

  canAttack(now = Date.now()) {
    const {state, player} = this.getAttackContext()
    return canStartAttack(player, now, this.lastShotAt, state?.game?.state)
  }

  startAiming() {
    if (!this.active || this.attackAiming || !this.canAttack()) return false
    this.attackAiming = true
    this.client.setAiming?.(true)
    return true
  }

  setupKeyboard() {
    if (!this.keyboardEnabled) return

    window.addEventListener("keydown", (e) => {
      this.keys[e.code] = true
      if (["KeyW","KeyA","KeyS","KeyD","ArrowUp","ArrowLeft","ArrowDown","ArrowRight"].includes(e.code)) this.sendKeyboardMove()
      if (e.code === "Space") {
        e.preventDefault()
        this.tryShoot(true)
      }
      if (e.code === "KeyQ") this.client.ability?.("primary")
      if (e.code === "KeyE") this.client.ability?.("secondary")
    }, {signal: this.events.signal})

    window.addEventListener("keyup", (e) => {
      if (["KeyW","KeyA","KeyS","KeyD","ArrowUp","ArrowLeft","ArrowDown","ArrowRight"].includes(e.code)) {
        this.keys[e.code] = false
        this.sendKeyboardMove()
      } else {
        this.keys[e.code] = false
      }
    }, {signal: this.events.signal})
  }

  setupMouse() {
    this.canvas.addEventListener("mousemove", (e) => {
      const rect = this.canvas.getBoundingClientRect()
      this.mouseX = e.clientX - rect.left
      this.mouseY = e.clientY - rect.top
      if (this.attackPointerStart && !this.attackAiming) {
        const drag = Math.hypot(this.mouseX - this.attackPointerStart.x, this.mouseY - this.attackPointerStart.y)
        if (!isAutoAimAttackGesture(drag)) this.startAiming()
      }
      this.sendRotation()
    }, {signal: this.events.signal})

    this.canvas.addEventListener("mousedown", (e) => {
      const rect = this.canvas.getBoundingClientRect()
      this.attackPointerStart = {x: e.clientX - rect.left, y: e.clientY - rect.top}
      this.attackAiming = false
    }, {signal: this.events.signal})

    window.addEventListener("mouseup", (e) => {
      if (!this.attackPointerStart) return
      const rect = this.canvas.getBoundingClientRect()
      const end = {x: e.clientX - rect.left, y: e.clientY - rect.top}
      const drag = Math.hypot(end.x - this.attackPointerStart.x, end.y - this.attackPointerStart.y)
      const autoAim = isAutoAimAttackGesture(drag)
      this.mouseX = end.x
      this.mouseY = end.y
      this.tryShoot(autoAim)
      this.attackPointerStart = null
      if (this.attackAiming) this.client.setAiming?.(false)
      this.attackAiming = false
    }, {signal: this.events.signal})
  }

  setupTouch() {
    this.canvas.addEventListener("touchstart", (e) => {
      e.preventDefault()
      const rect = this.canvas.getBoundingClientRect()
      for (let index = 0; index < e.changedTouches.length; index += 1) {
        const touch = e.changedTouches.item(index)
        const point = {x: touch.clientX - rect.left, y: touch.clientY - rect.top}
        if (point.x < rect.width / 2 && this.moveTouchId === null) {
          this.moveTouchId = touch.identifier
          this.touchStart = point
          this.touchMove = {...point}
          this.emitTouchControls()
        } else if (this.aimTouchId === null) {
          this.aimTouchId = touch.identifier
          this.aimStart = point
          this.aimCurrent = {...point}
          this.mouseX = point.x
          this.mouseY = point.y
          this.attackAiming = false
          this.sendRotation()
          this.emitTouchControls()
        }
      }
    }, {passive: false, signal: this.events.signal})

    this.canvas.addEventListener("touchmove", (e) => {
      e.preventDefault()
      const rect = this.canvas.getBoundingClientRect()
      for (let index = 0; index < e.changedTouches.length; index += 1) {
        const touch = e.changedTouches.item(index)
        const point = {x: touch.clientX - rect.left, y: touch.clientY - rect.top}
        if (touch.identifier === this.moveTouchId) this.touchMove = point
        if (touch.identifier === this.aimTouchId) {
          this.aimCurrent = point
          const dx = point.x - this.aimStart.x
          const dy = point.y - this.aimStart.y
          const distance = Math.hypot(dx, dy)
          if (!isAutoAimAttackGesture(distance)) {
            this.startAiming()
            const player = this.localPlayerId && this.getState?.()?.players?.[this.localPlayerId]
            const origin = this.getAimOrigin(rect, player)
            this.mouseX = origin.x + (dx / distance) * 100
            this.mouseY = origin.y + (dy / distance) * 100
            this.sendRotation()
          }
        }
      }
      this.emitTouchControls()
      this.sendMoveFromTouch()
    }, {passive: false, signal: this.events.signal})

    this.canvas.addEventListener("touchend", (e) => {
      e.preventDefault()
      for (let index = 0; index < e.changedTouches.length; index += 1) {
        const touch = e.changedTouches.item(index)
        if (touch.identifier === this.moveTouchId) {
          this.moveTouchId = null
          this.touchStart = null
          this.touchMove = null
          this.sendMove(0, 0)
          this.emitTouchControls()
        }
        if (touch.identifier === this.aimTouchId) {
          const drag = this.aimStart && this.aimCurrent
            ? Math.hypot(this.aimCurrent.x - this.aimStart.x, this.aimCurrent.y - this.aimStart.y)
            : 0
          this.tryShoot(isAutoAimAttackGesture(drag))
          this.aimTouchId = null
          this.aimStart = null
          this.aimCurrent = null
          this.shooting = false
          if (this.attackAiming) this.client.setAiming?.(false)
          this.attackAiming = false
          this.emitTouchControls()
        }
      }
    }, {passive: false, signal: this.events.signal})

    this.canvas.addEventListener("touchcancel", (e) => {
      e.preventDefault()
      this.moveTouchId = null
      this.aimTouchId = null
      this.touchStart = null
      this.touchMove = null
      this.aimStart = null
      this.aimCurrent = null
      this.shooting = false
      if (this.attackAiming) this.client.setAiming?.(false)
      this.attackAiming = false
      this.sendMove(0, 0)
      this.emitTouchControls()
    }, {passive: false, signal: this.events.signal})
  }

  emitTouchControls() {
    this.onTouchControlsChange?.({
      move: this.touchStart && this.touchMove ? {start: this.touchStart, current: this.touchMove} : null,
      aim: this.aimStart && this.aimCurrent ? {start: this.aimStart, current: this.aimCurrent} : null,
    })
  }

  sendMoveFromTouch() {
    if (!this.active || !this.touchStart || !this.touchMove) return

    const dx = this.touchMove.x - this.touchStart.x
    const dy = this.touchMove.y - this.touchStart.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist > 10) {
      const nx = dx / dist
      const ny = dy / dist
      this.sendMove(nx, ny)
    } else {
      this.sendMove(0, 0)
    }
  }

  sendMove(dx, dy) {
    const moving = Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001
    if (!this.active && moving) return
    const now = performance.now()
    const changed = this.lastMoveX !== dx || this.lastMoveY !== dy
    if (!changed && (!moving || now - this.lastMoveSentAt < this.moveSendInterval)) return
    this.lastMoveX = dx
    this.lastMoveY = dy
    this.lastMoveSentAt = now
    const ack = this.client.move(dx, dy)
    this.onMove?.(dx, dy, ack)
  }

  sendRotation() {
    if (!this.active || !this.localPlayerId || !this.getState) return

    const state = this.getState()
    const player = state?.players?.[this.localPlayerId]
    if (!player) return

    const rect = this.canvas.getBoundingClientRect()
    const screenX = this.mouseX
    const screenY = this.mouseY
    const origin = this.getAimOrigin(rect, player)

    const rotation = this.resolveAimAngle(screenX, screenY, player, origin)
    const now = performance.now()
    const delta = this.lastRotation === null
      ? Infinity
      : Math.abs(Math.atan2(Math.sin(rotation - this.lastRotation), Math.cos(rotation - this.lastRotation)))
    if (delta < 0.01 || now - this.lastRotationSentAt < this.rotationSendInterval) return
    this.lastRotation = rotation
    this.lastRotationSentAt = now
    this.client.rotate(rotation, this.resolveAimDistance(screenX, screenY, origin))
  }

  tryShoot(autoAim = false) {
    if (!this.active) return
    const {state, player} = this.getAttackContext()
    const now = Date.now()
    if (!canStartAttack(player, now, this.lastShotAt, state?.game?.state)) {
      this.queueBufferedAttack(autoAim, now, state, player)
      return
    }

    this.pendingAttack = null
    this.sendShot(autoAim, player, now)
  }

  queueBufferedAttack(autoAim, now, state, player) {
    if (state?.game?.state !== "game" || !player || Number(player.lives) <= 0 || Number(player.ammo) <= 0) return false

    const rect = this.canvas.getBoundingClientRect()
    const screenX = this.mouseX
    const screenY = this.mouseY
    const origin = this.getAimOrigin(rect, player)

    const angle = this.resolveAimAngle(screenX, screenY, player, origin)
    this.pendingAttack = {
      angle,
      distance: this.resolveAimDistance(screenX, screenY, origin),
      autoAim,
      expiresAt: now + ATTACK_INPUT_BUFFER_MS,
    }
    return true
  }

  sendShot(autoAim, player, now, buffered = null) {
    const sentAt = buffered
      ? this.client.shoot(buffered.angle, buffered.distance, buffered.autoAim)
      : (() => {
        const rect = this.canvas.getBoundingClientRect()
        const screenX = this.mouseX
        const screenY = this.mouseY
        const origin = this.getAimOrigin(rect, player)
        const angle = this.resolveAimAngle(screenX, screenY, player, origin)
        return this.client.shoot(angle, this.resolveAimDistance(screenX, screenY, origin), autoAim)
      })()
    if (sentAt !== null && sentAt !== undefined) {
      this.lastShotAt = now
      triggerTelegramHaptic(globalThis, "impact", "light")
    }
    return sentAt
  }

  flushBufferedAttack(now = Date.now()) {
    const buffered = this.pendingAttack
    if (!buffered) return false
    if (now > buffered.expiresAt) {
      this.pendingAttack = null
      return false
    }
    const {state, player} = this.getAttackContext()
    if (!canStartAttack(player, now, this.lastShotAt, state?.game?.state)) return false
    this.pendingAttack = null
    return this.sendShot(buffered.autoAim, player, now, buffered) !== null
  }

  /*
   * A release during the server's short recovery/cadence window is still a
   * deliberate input. Retain it briefly, then let the authoritative snapshot
   * decide when the shot may actually be sent.
   */
  flushBufferedAttackOnUpdate() {
    this.flushBufferedAttack(Date.now())
  }

  update() {
    if (!this.active) return
    this.flushBufferedAttackOnUpdate()
    this.sendKeyboardMove()

  }

  useAbility(slot) {
    if (!this.active) return null
    const {player} = this.getAttackContext()
    if (!player || !this.client?.ability) return null
    const contract = getHeroAbilityInputContract(player.hero || player.heroName, slot)
    if (contract.mode === "self") {
      const sentAt = this.client.ability(slot, undefined, buildAbilityInput({contract}))
      if (sentAt !== null && sentAt !== undefined) triggerTelegramHaptic(globalThis, "impact", "medium")
      return sentAt
    }
    const rect = this.canvas.getBoundingClientRect()
    const origin = this.getAimOrigin(rect, player)
    const angle = this.resolveAimAngle(this.mouseX, this.mouseY, player, origin)
    const distance = this.resolveAimDistance(this.mouseX, this.mouseY, origin)
    const sentAt = this.client.ability(slot, undefined, buildAbilityInput({contract, aimAngle: angle, aimDistance: distance}))
    if (sentAt !== null && sentAt !== undefined) triggerTelegramHaptic(globalThis, "impact", "medium")
    return sentAt
  }

  sendKeyboardMove() {
    if (!this.active) return
    const {x: dx, y: dy} = getKeyboardMoveDirection(this.keys)
    if (this.moveTouchId === null) this.sendMove(dx, dy)
    else this.sendMove(this.lastMoveX || 0, this.lastMoveY || 0)
  }

  destroy() {
    this.events.abort()
    this.shooting = false
    this.pendingAttack = null
    if (this.attackAiming) this.client.setAiming?.(false)
    this.attackAiming = false
    this.keys = {}
    this.sendMove(0, 0)
    this.onTouchControlsChange?.({move: null, aim: null})
  }
}
