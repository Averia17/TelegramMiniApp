import {DEPTH, HERO_PALETTES, HERO_SCALE} from "../config"
import {clamp, colorFromCss, lerp, project} from "../graphics"

const hex = color => `#${color.toString(16).padStart(6, "0")}`

const ellipse = (ctx, x, y, rx, ry, color, alpha = 1) => {
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1
}

const rounded = (ctx, x, y, width, height, radius, color) => {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, radius)
  ctx.fill()
}

export class CanvasCharacterView {
  constructor(player) {
    this.state = player
    this.worldX = player.x
    this.worldY = player.y
    this.lastTargetX = player.x
    this.lastTargetY = player.y
    this.speed = 0
    this.phase = Math.random() * Math.PI * 2
    this.aim = player.rotation || 0
    this.recoil = 0
    this.lastLives = player.lives
    this.lean = 0
    this.stepImpact = 0
    this.previousGait = 0
  }

  setState(player) {
    if (this.lastLives !== undefined && player.lives < this.lastLives) this.hurt = 1
    this.lastLives = player.lives
    this.state = player
  }

  triggerRecoil() {
    this.recoil = 1
  }

  update(delta) {
    const blend = 1 - Math.exp(-13 * delta)
    this.worldX = lerp(this.worldX, this.state.x, blend)
    this.worldY = lerp(this.worldY, this.state.y, blend)
    const dx = this.state.x - this.lastTargetX
    const dy = this.state.y - this.lastTargetY
    const distance = Math.hypot(dx, dy)
    const targetSpeed = clamp(distance / Math.max(delta * 150, 0.001), 0, 1)
    this.speed = lerp(this.speed, targetSpeed, 1 - Math.exp(-12 * delta))
    const targetLean = clamp(dx / Math.max(delta * 520, 1), -0.13, 0.13) * this.speed
    this.lean = lerp(this.lean, targetLean, 1 - Math.exp(-9 * delta))
    this.lastTargetX = this.state.x
    this.lastTargetY = this.state.y
    this.phase += delta * (3.5 + this.speed * 9)
    const gaitNow = Math.sin(this.phase)
    if (this.speed > 0.35 && Math.sign(gaitNow) !== Math.sign(this.previousGait)) this.stepImpact = 1
    this.previousGait = gaitNow
    let aimDelta = (this.state.rotation || 0) - this.aim
    aimDelta = Math.atan2(Math.sin(aimDelta), Math.cos(aimDelta))
    this.aim += aimDelta * (1 - Math.exp(-15 * delta))
    this.recoil = Math.max(0, this.recoil - delta * 7.5)
    this.hurt = Math.max(0, (this.hurt || 0) - delta * 4)
    this.stepImpact = Math.max(0, this.stepImpact - delta * 9)
  }

  get depth() {
    return this.worldY * DEPTH
  }

  draw(ctx, time, isLocal) {
    const projected = project(this.worldX, this.worldY)
    const hero = HERO_PALETTES[String(this.state.hero || "default").toLowerCase()] || HERO_PALETTES.default
    const palette = {...hero, main: colorFromCss(this.state.color, hero.main)}
    const gait = Math.sin(this.phase) * this.speed
    const bounce = Math.abs(Math.sin(this.phase)) * this.speed
    const idle = Math.sin(time * 2.2 + this.phase * 0.1)
    const direction = Math.cos(this.aim) < 0 ? -1 : 1
    const screenAim = Math.atan2(Math.sin(this.aim) * DEPTH, Math.cos(this.aim))

    ctx.save()
    ctx.translate(projected.x, projected.y)
    ctx.scale(HERO_SCALE, HERO_SCALE)
    if (this.hurt > 0 && Math.floor(this.hurt * 12) % 2) ctx.globalAlpha = 0.45

    ellipse(ctx, 7, 8, 29 + this.speed * 4, 10, "#182435", 0.3)
    if (isLocal) {
      ctx.strokeStyle = `rgba(108,244,255,${0.72 + Math.sin(time * 4) * 0.16})`
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.ellipse(0, 5, 30, 13, 0, 0, Math.PI * 2)
      ctx.stroke()
    }

    ctx.save()
    ctx.translate(0, -bounce * 3 + idle * 0.7)
    ctx.rotate(this.lean)
    ctx.scale(1 + this.stepImpact * 0.035, 1 - this.stepImpact * 0.045)
    ctx.scale(direction, 1)

    this.drawLeg(ctx, -9, -16 + Math.max(0, -gait) * 7, gait * 0.7, hex(palette.dark))
    this.drawLeg(ctx, 9, -16 + Math.max(0, gait) * 7, -gait * 0.7, "#34436b")

    ellipse(ctx, 0, -35, 25, 29, hex(palette.dark))
    ctx.fillStyle = hex(palette.main)
    ctx.beginPath()
    ctx.moveTo(-22, -51)
    ctx.lineTo(-14, -61)
    ctx.lineTo(14, -61)
    ctx.lineTo(22, -51)
    ctx.lineTo(19, -21)
    ctx.lineTo(0, -15)
    ctx.lineTo(-19, -21)
    ctx.closePath()
    ctx.fill()
    ellipse(ctx, -10, -47, 8, 12, hex(palette.light), 0.32)
    rounded(ctx, -23, -34, 46, 10, 5, hex(palette.dark))
    rounded(ctx, -19, -32, 38, 5, 3, hex(palette.accent))
    this.drawHeroBadge(ctx, palette)
    this.drawHead(ctx, palette, -76 - bounce * 1.5, direction, screenAim)
    ctx.restore()

    ctx.save()
    ctx.translate(this.lean * 45, -45 - bounce * 2 + idle * 0.35)
    ctx.rotate(screenAim)
    ctx.scale(1, 0.88 + Math.abs(Math.sin(this.aim)) * 0.12)
    this.drawWeaponRig(ctx, palette)
    ctx.restore()

    this.drawUi(ctx)
    ctx.restore()
  }

  drawLeg(ctx, x, y, rotation, color) {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rotation)
    rounded(ctx, -5, 0, 10, 21, 5, color)
    ellipse(ctx, 0, 21, 6, 4, "#20263f")
    ctx.restore()
  }

  drawHeroBadge(ctx, palette) {
    const hero = String(this.state.hero || "").toLowerCase()
    if (["titan", "boulder"].includes(hero)) {
      ellipse(ctx, -23, -51, 13, 11, hex(palette.dark))
      ellipse(ctx, 23, -51, 13, 11, hex(palette.dark))
      rounded(ctx, -15, -47, 30, 18, 6, "#30384c")
    } else if (["viper", "shadow"].includes(hero)) {
      ctx.fillStyle = hex(palette.dark)
      ctx.beginPath()
      ctx.moveTo(-21, -56); ctx.lineTo(-30, -44); ctx.lineTo(-18, -37); ctx.closePath(); ctx.fill()
      ctx.beginPath()
      ctx.moveTo(21, -56); ctx.lineTo(30, -44); ctx.lineTo(18, -37); ctx.closePath(); ctx.fill()
    } else {
      ellipse(ctx, 0, -37, 7, 7, hex(palette.accent))
      ellipse(ctx, -2, -40, 2, 2, "#ffffff", 0.55)
    }
  }

  drawHead(ctx, palette, y, direction, aim) {
    const look = clamp(Math.cos(aim) * 2.4, -2.4, 2.4)
    ellipse(ctx, 2, y + 5, 24, 25, hex(palette.dark))
    rounded(ctx, -21, y - 20, 42, 42, 17, hex(palette.skin))
    ellipse(ctx, -20, y + 1, 5, 8, hex(palette.skin))
    ellipse(ctx, 20, y + 1, 5, 8, hex(palette.skin))
    ellipse(ctx, -7, y - 2, 6, 7, "#ffffff")
    ellipse(ctx, 7, y - 2, 6, 7, "#ffffff")
    ellipse(ctx, -6 + look, y - 1, 2.5, 3.5, "#263052")
    ellipse(ctx, 6 + look, y - 1, 2.5, 3.5, "#263052")
    ctx.fillStyle = hex(palette.main)
    ctx.beginPath()
    ctx.moveTo(-23, y - 6); ctx.lineTo(-18, y - 27); ctx.lineTo(-8, y - 22)
    ctx.lineTo(1, y - 31); ctx.lineTo(9, y - 23); ctx.lineTo(19, y - 27)
    ctx.lineTo(23, y - 6); ctx.lineTo(13, y - 16); ctx.lineTo(0, y - 14); ctx.lineTo(-13, y - 16)
    ctx.closePath(); ctx.fill()
    ctx.strokeStyle = "rgba(90,44,47,.75)"
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(-5, y + 10); ctx.quadraticCurveTo(0, y + 14, 7, y + 9); ctx.stroke()
  }

  drawWeaponRig(ctx, palette) {
    const recoil = this.recoil * 7
    ctx.lineCap = "round"
    ctx.strokeStyle = hex(palette.dark)
    ctx.lineWidth = 11
    ctx.beginPath(); ctx.moveTo(-13 - recoil * 0.3, -5); ctx.lineTo(15 - recoil * 0.3, 0); ctx.stroke()
    ctx.strokeStyle = hex(palette.skin)
    ctx.lineWidth = 9
    ctx.beginPath(); ctx.moveTo(2 - recoil * 0.3, 0); ctx.lineTo(18 - recoil * 0.3, 0); ctx.stroke()

    ctx.save()
    ctx.translate(6 - recoil, 0)
    if (["dagger", "claw"].includes(palette.weapon)) {
      rounded(ctx, 0, -5, 12, 10, 4, "#303955")
      rounded(ctx, 9, -3, 27, 6, 3, "#e8f4ff")
      ctx.fillStyle = hex(palette.accent)
      ctx.beginPath(); ctx.moveTo(31, -5); ctx.lineTo(44, 0); ctx.lineTo(31, 5); ctx.closePath(); ctx.fill()
    } else if (palette.weapon === "orb") {
      ellipse(ctx, 20, 0, 15, 15, hex(palette.accent), 0.3)
      ellipse(ctx, 20, 0, 7, 7, "#ffffff")
    } else if (palette.weapon === "fists") {
      ellipse(ctx, 15, 0, 14, 12, hex(palette.dark))
      ellipse(ctx, 19, -4, 5, 4, hex(palette.light), 0.4)
    } else {
      const length = palette.weapon === "rifle" ? 47 : palette.weapon === "cannon" ? 38 : 41
      rounded(ctx, 0, -9, length + 8, 18, 7, "#171d31")
      rounded(ctx, 2, -7, length, 14, 5, "#35415f")
      rounded(ctx, 8, -5, length - 13, 6, 3, hex(palette.accent))
      rounded(ctx, length - 1, -5, 15, 10, 3, "#11172a")
      rounded(ctx, 9, 5, 9, 14, 3, "#242d48")
    }
    if (this.recoil > 0.64) {
      ctx.globalAlpha = (this.recoil - 0.64) * 2.7
      ctx.fillStyle = "#fff3a2"
      ctx.beginPath(); ctx.moveTo(48, 0); ctx.lineTo(61, -8); ctx.lineTo(57, 0); ctx.lineTo(63, 8); ctx.closePath(); ctx.fill()
      ctx.globalAlpha = 1
    }
    ctx.restore()

    ctx.strokeStyle = hex(palette.main)
    ctx.lineWidth = 12
    ctx.beginPath(); ctx.moveTo(-9 - recoil * 0.5, 8); ctx.lineTo(21 - recoil * 0.5, 1); ctx.stroke()
    ctx.strokeStyle = hex(palette.skin)
    ctx.lineWidth = 9
    ctx.beginPath(); ctx.moveTo(7 - recoil * 0.5, 3); ctx.lineTo(23 - recoil * 0.5, 1); ctx.stroke()
  }

  drawUi(ctx) {
    const maxLives = this.state.maxLives || 1
    const health = clamp((this.state.lives ?? maxLives) / maxLives, 0, 1)
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.font = "800 10px Arial"
    ctx.lineWidth = 4
    ctx.strokeStyle = "#1b2854"
    const name = this.state.name || this.state.hero || "Fighter"
    ctx.strokeText(name, 0, -105)
    ctx.fillStyle = "#ffffff"
    ctx.fillText(name, 0, -105)
    rounded(ctx, -25, -97, 50, 8, 4, "#15203e")
    ctx.fillStyle = health < 0.35 ? "#ff4b57" : health < 0.65 ? "#ffc934" : "#55df57"
    ctx.beginPath(); ctx.roundRect(-22, -94, 44 * health, 3, 2); ctx.fill()
  }
}
