export class Input {
  constructor(canvas, gameClient) {
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
    this.shooting = false
    this.lastShotAt = 0
    this.shootCooldown = 800
    this.localPlayerId = null
    this.getState = null
    this.events = new AbortController()
    this.lastMoveX = null
    this.lastMoveY = null
    this.lastMoveSentAt = 0
    this.moveSendInterval = 50

    this.setupKeyboard()
    this.setupMouse()
    this.setupTouch()
  }

  setLocalPlayer(id, stateGetter) {
    this.localPlayerId = id
    this.getState = typeof stateGetter === "function" ? stateGetter : () => stateGetter
  }

  setupKeyboard() {
    window.addEventListener("keydown", (e) => {
      this.keys[e.code] = true
      if (e.code === "Space") {
        e.preventDefault()
        this.tryShoot()
      }
    }, {signal: this.events.signal})

    window.addEventListener("keyup", (e) => {
      this.keys[e.code] = false
    }, {signal: this.events.signal})
  }

  setupMouse() {
    this.canvas.addEventListener("mousemove", (e) => {
      const rect = this.canvas.getBoundingClientRect()
      this.mouseX = e.clientX - rect.left
      this.mouseY = e.clientY - rect.top
      this.sendRotation()
    }, {signal: this.events.signal})

    this.canvas.addEventListener("mousedown", () => {
      this.shooting = true
      this.tryShoot()
    }, {signal: this.events.signal})

    window.addEventListener("mouseup", () => {
      this.shooting = false
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
        } else if (this.aimTouchId === null) {
          this.aimTouchId = touch.identifier
          this.aimStart = point
          this.mouseX = point.x
          this.mouseY = point.y
          this.shooting = true
          this.sendRotation()
          this.tryShoot()
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
          const dx = point.x - this.aimStart.x
          const dy = point.y - this.aimStart.y
          const distance = Math.hypot(dx, dy)
          if (distance > 8) {
            this.mouseX = rect.width / 2 + (dx / distance) * 100
            this.mouseY = rect.height / 2 + (dy / distance) * 100
            this.sendRotation()
          }
        }
      }
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
        }
        if (touch.identifier === this.aimTouchId) {
          this.aimTouchId = null
          this.aimStart = null
          this.shooting = false
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
      this.shooting = false
      this.sendMove(0, 0)
    }, {passive: false, signal: this.events.signal})
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
    this.client.move(dx, dy)
  }

  sendRotation() {
    if (!this.localPlayerId || !this.getState) return

    const state = this.getState()
    const player = state?.players?.[this.localPlayerId]
    if (!player) return

    const rect = this.canvas.getBoundingClientRect()
    const screenX = this.mouseX
    const screenY = this.mouseY

    const rotation = Math.atan2(
      screenY - rect.height / 2,
      screenX - rect.width / 2
    )
    this.client.rotate(rotation)
  }

  tryShoot() {
    const now = Date.now()
    if (now - this.lastShotAt < this.shootCooldown) return
    this.lastShotAt = now

    const rect = this.canvas.getBoundingClientRect()
    const screenX = this.mouseX
    const screenY = this.mouseY

    const angle = Math.atan2(
      screenY - rect.height / 2,
      screenX - rect.width / 2
    )
    this.client.shoot(angle)
  }

  update() {
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

    if (this.shooting) {
      this.tryShoot()
    }
  }

  destroy() {
    this.events.abort()
    this.shooting = false
    this.keys = {}
    this.sendMove(0, 0)
  }
}
