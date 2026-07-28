const AUTO_AIM_GESTURE_DRAG_LIMIT = 10

export const isAutoAimAttackGesture = (dragDistance) =>
  Number(dragDistance) < AUTO_AIM_GESTURE_DRAG_LIMIT

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
    // The battle engine owns each hero's real cadence. Input only debounces noisy pointers.
    this.shootCooldown = 90
    this.localPlayerId = null
    this.getState = null
    this.getPlayerScreenPosition = null
    this.events = new AbortController()
    this.lastMoveX = null
    this.lastMoveY = null
    this.lastMoveSentAt = 0
    this.moveSendInterval = 50
    this.lastRotation = null
    this.lastRotationSentAt = 0
    this.rotationSendInterval = 33
    this.attackPointerStart = null
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

  resolveAimAngle(screenX, screenY, player, origin) {
    const projected = this.getAimAngleFromScreen?.(screenX, screenY, player)
    return Number.isFinite(projected) ? projected : Math.atan2(screenY-origin.y, screenX-origin.x)
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

  setupKeyboard() {
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
      this.sendRotation()
    }, {signal: this.events.signal})

    this.canvas.addEventListener("mousedown", (e) => {
      const rect = this.canvas.getBoundingClientRect()
      this.attackPointerStart = {x: e.clientX - rect.left, y: e.clientY - rect.top}
      this.client.setAiming?.(true)
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
      this.client.setAiming?.(false)
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
          this.client.setAiming?.(true)
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
          if (distance > 8) {
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
          this.client.setAiming?.(false)
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
      this.client.setAiming?.(false)
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
    if (!this.touchStart || !this.touchMove) return

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
    const now = performance.now()
    const changed = this.lastMoveX !== dx || this.lastMoveY !== dy
    const moving = Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001
    if (!changed && (!moving || now - this.lastMoveSentAt < this.moveSendInterval)) return
    this.lastMoveX = dx
    this.lastMoveY = dy
    this.lastMoveSentAt = now
    const ack = this.client.move(dx, dy)
    this.onMove?.(dx, dy, ack)
  }

  sendRotation() {
    if (!this.localPlayerId || !this.getState) return

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
    const player = this.localPlayerId && this.getState?.()?.players?.[this.localPlayerId]
    if (player && Number(player.ammo) <= 0) return
    const now = Date.now()
    if (now - this.lastShotAt < this.shootCooldown) return
    this.lastShotAt = now

    const rect = this.canvas.getBoundingClientRect()
    const screenX = this.mouseX
    const screenY = this.mouseY
    const origin = this.getAimOrigin(rect, player)

    const angle = this.resolveAimAngle(screenX, screenY, player, origin)
    this.client.shoot(angle, this.resolveAimDistance(screenX, screenY, origin), autoAim)
  }

  update() {
    this.sendKeyboardMove()

  }

  sendKeyboardMove() {
    let dx = 0
    let dy = 0

    if (this.keys["KeyW"] || this.keys["ArrowUp"]) dy -= 1
    if (this.keys["KeyS"] || this.keys["ArrowDown"]) dy += 1
    if (this.keys["KeyA"] || this.keys["ArrowLeft"]) dx -= 1
    if (this.keys["KeyD"] || this.keys["ArrowRight"]) dx += 1

    if (dx !== 0 || dy !== 0) {
      const length = Math.hypot(dx, dy)
      dx /= length
      dy /= length
    }
    if (this.moveTouchId === null) this.sendMove(dx, dy)
    else this.sendMove(this.lastMoveX || 0, this.lastMoveY || 0)
  }

  destroy() {
    this.events.abort()
    this.shooting = false
    this.client.setAiming?.(false)
    this.keys = {}
    this.sendMove(0, 0)
    this.onTouchControlsChange?.({move: null, aim: null})
  }
}
