import {DEPTH, HERO_PALETTES, HERO_SCALE, HERO_SPRITESHEETS} from "../config"
import {clamp, lerp, project} from "../graphics"
import {drawDirectionalFrame, getDirectionBlend, getSpriteImage} from "./DirectionalSpriteSheet"

const hex = color => `#${color.toString(16).padStart(6, "0")}`

const ellipse = (ctx, x, y, rx, ry, color, alpha = 1) => {
  const previousAlpha = ctx.globalAlpha
  ctx.globalAlpha = previousAlpha * alpha
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = previousAlpha
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
    this.visibility = 1
    this.targetVisibility = 1
    this.revealedUntil = 0
    this.lastAttackPulse = player.attackPulse
    this.attackMotion = 0
    this.attackType = player.attackType || ""
    this.hitFlash = 0
    this.hitImpulse = 0
    this.hitImpulseX = 0
    this.hitImpulseY = 0
    this.motionState = "idle"
    this.animationFrame = 0
    this.airborneVisual = 0
  }

  setState(player) {
    if (this.lastLives !== undefined && player.lives < this.lastLives) {
      this.hurt = 1
      this.hitFlash = .1
      this.hitImpulse = 1
      this.hitImpulseX = Number(player.hitImpulseX) || 0
      this.hitImpulseY = Number(player.hitImpulseY) || 0
      this.revealedUntil = performance.now() + 2000
    }
    if (this.lastAttackPulse !== undefined && player.attackPulse !== this.lastAttackPulse) {
      this.revealedUntil = performance.now() + 2000
      this.attackMotion = 1
      this.attackType = player.attackType || ""
      this.aim = player.rotation || 0
    }
    this.lastLives = player.lives
    this.lastAttackPulse = player.attackPulse
    this.state = player
  }

  reveal(duration = 1000) {
    this.revealedUntil = Math.max(this.revealedUntil, performance.now() + duration)
  }

  triggerRecoil() {
    this.recoil = 1
  }

  update(delta, isLocal = false) {
	// Server snapshots arrive at 30 Hz. Interpolate the authoritative local
	// player too, otherwise the camera exposes every network step as a hitch.
	const blend = 1 - Math.exp(-(isLocal ? 28 : 13) * delta)
	const previousWorldX = this.worldX
	const previousWorldY = this.worldY
	this.worldX = lerp(this.worldX, this.state.x, blend)
	this.worldY = lerp(this.worldY, this.state.y, blend)
    const dx = this.state.x - this.lastTargetX
    const dy = this.state.y - this.lastTargetY
    const distance = Math.hypot(dx, dy)
    // Animation follows displacement that actually survived collision and
    // server reconciliation, not the requested input vector.
    const actualVelocity = Math.hypot(this.worldX - previousWorldX, this.worldY - previousWorldY) / Math.max(delta, .001)
    const targetSpeed = clamp(actualVelocity / 150, 0, 1)
    this.speed = lerp(this.speed, targetSpeed, 1 - Math.exp(-12 * delta))
    const targetLean = clamp(dx / Math.max(delta * 520, 1), -0.13, 0.13) * this.speed
    this.lean = lerp(this.lean, targetLean, 1 - Math.exp(-9 * delta))
    this.lastTargetX = this.state.x
    this.lastTargetY = this.state.y
    this.phase += delta * (this.speed > .08 ? this.speed * 12.5 : 2.2)
    const gaitNow = Math.sin(this.phase)
    if (this.speed > 0.35 && Math.sign(gaitNow) !== Math.sign(this.previousGait)) this.stepImpact = 1
    this.previousGait = gaitNow
    let aimDelta = (this.state.rotation || 0) - this.aim
    aimDelta = Math.atan2(Math.sin(aimDelta), Math.cos(aimDelta))
    this.aim += aimDelta * (1 - Math.exp(-15 * delta))
    this.recoil = Math.max(0, this.recoil - delta * 7.5)
    this.attackMotion = Math.max(0, this.attackMotion - delta * 5.8)
    this.hitFlash = Math.max(0, this.hitFlash - delta)
    this.hitImpulse = Math.max(0, this.hitImpulse - delta * 11)
    this.hurt = Math.max(0, (this.hurt || 0) - delta * 4)
    this.stepImpact = Math.max(0, this.stepImpact - delta * 9)
    this.visibility = lerp(this.visibility, this.targetVisibility, 1 - Math.exp(-16 * delta))
    this.motionState = this.hitFlash > 0 ? "hit" : this.attackMotion > 0 ? "attack" : this.speed > .08 ? "run" : "idle"
    const configuredAtlas = HERO_SPRITESHEETS[String(this.state.hero || "").toLowerCase()]
    const atlas = configuredAtlas?.enabled === false ? null : configuredAtlas
    const clip = atlas?.animations[this.motionState] || atlas?.animations.idle
    const playbackRate = this.motionState === "run" ? this.speed : 1
    this.animationFrame = (this.animationFrame + delta * (clip?.fps || 0) * playbackRate) % Math.max(1, clip?.frames || 1)
    const airborne = clamp(Math.max(Number(this.state.airborne) || 0, Number(this.state.flying) || 0), 0, 1)
    this.airborneVisual = lerp(this.airborneVisual, airborne, 1 - Math.exp(-12 * delta))
  }

  get depth() {
    return this.worldY
  }

  drawShadow(ctx) {
    const projected = project(this.worldX, this.worldY)
    const lift = this.airborneVisual
    const lightX = -0.7
    const lightY = -0.45
    const offset = 6 + lift * 16
    const scale = 1 - lift * .38
    ctx.save()
    ctx.globalAlpha = this.visibility * (.34 - lift * .2)
    ctx.fillStyle = "#142033"
    ctx.translate(projected.x - lightX * offset, projected.y - lightY * offset)
    ctx.scale(1, DEPTH)
    ctx.beginPath()
    ctx.ellipse(0, 0, (30 + this.speed * 3) * scale, 15 * scale, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  draw(ctx, time, isLocal) {
    if (this.visibility < .02) return
    const projected = project(this.worldX, this.worldY)
    const hero = HERO_PALETTES[String(this.state.hero || "default").toLowerCase()] || HERO_PALETTES.default
    const palette = hero
    const gait = Math.sin(this.phase) * this.speed
    const bounce = Math.abs(Math.sin(this.phase)) * this.speed
    const idle = Math.sin(time * 2.2 + this.phase * 0.1)
    const direction = Math.cos(this.aim) < 0 ? -1 : 1
    const weaponAngle = Math.atan2(Math.sin(this.aim) * DEPTH, Math.abs(Math.cos(this.aim)))
    const heroName = String(this.state.hero || "").toLowerCase()
    const configuredAtlas = HERO_SPRITESHEETS[heroName]
    const atlas = configuredAtlas?.enabled === false ? null : configuredAtlas
    const sprite = getSpriteImage(atlas?.source)
    const characterScale = ({shelly: 1.1, colt: 1.06, barley: 1.04, viper: 1.08, pixel: 1.02, shadow: .98, spark: 1.02, titan: .94, rex: .92, nova: .98, boulder: 1, frost: 1.03}[heroName] || 1)


    this.drawShadow(ctx)
    ctx.save()
	ctx.globalAlpha = this.visibility * (this.state.stealth > 0 ? .42 : 1)
	if (this.hitFlash > 0) ctx.filter = "brightness(0) invert(1)"
    ctx.translate(projected.x + this.hitImpulseX * this.hitImpulse * 5, projected.y + this.hitImpulseY * DEPTH * this.hitImpulse * 5)
    const modelScale = Number(this.state.renderScale) || 1
	ctx.scale(HERO_SCALE * characterScale * modelScale, HERO_SCALE * characterScale * modelScale)
	const strike = Math.sin(this.attackMotion * Math.PI)
	ctx.rotate(this.lean * .45)
	if (this.attackType === "slam") {
	  ctx.translate(Math.cos(this.aim) * strike * 9, strike * 5)
	  ctx.scale(1 + strike * .12, 1 - strike * .08)
	} else if (this.attackType === "dash") {
	  ctx.rotate(Math.sin(this.aim) * strike * .16)
	  ctx.translate(strike * 13, -strike * 4)
	} else if (this.attackType === "double_melee") {
	  const side = (this.lastAttackPulse || 0) % 2 ? -1 : 1
	  ctx.rotate(side * strike * .13)
	  ctx.translate(strike * 7, 0)
	} else if (this.attackType === "boomerang") {
	  ctx.rotate(-strike * .1)
	  ctx.translate(strike * 8, -strike * 3)
	} else if (strike > 0) {
	  ctx.translate(-strike * 3, 0)
	}
	const airborne = this.state.airborne > 0 || this.state.flying > 0
	if (airborne) ctx.translate(0, -12 - this.airborneVisual * 12 - Math.abs(Math.sin(time * 7)) * 4)
	if (this.state.stun > 0) ctx.rotate(Math.sin(time * 24) * .055)

    if (isLocal) {
      ctx.strokeStyle = `rgba(108,244,255,${0.72 + Math.sin(time * 4) * 0.16})`
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.ellipse(0, 5, 30, 13, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    if (this.state.shield > 0) {
      ctx.strokeStyle = `rgba(111,226,255,${.55 + Math.sin(time * 7) * .2})`
      ctx.lineWidth = 5
      ctx.beginPath(); ctx.ellipse(0, -42, 39, 58, 0, 0, Math.PI * 2); ctx.stroke()
    }
	if (this.state.invulnerable > 0) {
	  ctx.strokeStyle = `rgba(255,255,255,${.65 + Math.sin(time * 11) * .25})`
	  ctx.lineWidth = 6
	  ctx.beginPath(); ctx.ellipse(0, -42, 43, 62, 0, 0, Math.PI * 2); ctx.stroke()
	}
    if (this.state.haste > 0) {
      ctx.strokeStyle = "rgba(255,224,74,.65)"; ctx.lineWidth = 4
      for (let trail = 0; trail < 3; trail += 1) { ctx.beginPath(); ctx.moveTo(-34 - trail * 7, -18 - trail * 12); ctx.lineTo(-50 - trail * 8, -12 - trail * 12); ctx.stroke() }
    }
	if (this.state.vine > 0) {
	  ctx.strokeStyle = "rgba(139,255,98,.7)"; ctx.lineWidth = 4
	  ctx.beginPath(); ctx.ellipse(0, 1, 31 + Math.sin(time * 8) * 4, 12, 0, 0, Math.PI * 2); ctx.stroke()
	}
	if (this.state.vortex > 0 || this.state.channel > 0) {
	  ctx.strokeStyle = this.state.vortex > 0 ? "rgba(119,82,225,.72)" : "rgba(93,242,255,.72)"
	  ctx.lineWidth = 4
	  for (let ring = 0; ring < 2; ring += 1) { ctx.beginPath(); ctx.arc(0, -42, 34 + ring * 9, time * 4 + ring * Math.PI, time * 4 + ring * Math.PI + 4.4); ctx.stroke() }
	}

    ctx.save()
    ctx.translate(0, -bounce * 3 + idle * 0.7)
    ctx.rotate(this.lean)
    ctx.scale(1 + this.stepImpact * 0.035, 1 - this.stepImpact * 0.045)
    // Legacy vector heroes still mirror their procedural pose. True
    // directional sheets already contain left/right silhouettes.
    if (!sprite) ctx.scale(direction, 1)

    if (sprite) {
      const blendDirection = getDirectionBlend(this.aim)
      drawDirectionalFrame(ctx, sprite, atlas, this.motionState, blendDirection.from, this.animationFrame, 1 - blendDirection.mix)
      drawDirectionalFrame(ctx, sprite, atlas, this.motionState, blendDirection.to, this.animationFrame, blendDirection.mix)
    } else {
      this.drawUniqueHero(ctx, palette, heroName, gait, time, weaponAngle)
    }
    if (this.hurt > 0) {
      ctx.globalCompositeOperation = "source-atop"
      ctx.globalAlpha = Math.min(1, this.hurt * 1.35)
      ctx.fillStyle = "#fff"
      ctx.fillRect(-65, -115, 130, 130)
      ctx.globalCompositeOperation = "source-over"
      ctx.globalAlpha = 1
    }
    ctx.restore()

    if (this.visibility > .82 && !this.state.hideUi) this.drawUi(ctx)
    ctx.restore()
  }

  drawLeg(ctx, x, y, rotation, color) {
    ctx.save()
    ctx.translate(x, y)
    const thighAngle = rotation * .72
    const shinAngle = -rotation * .48
    ctx.rotate(thighAngle)
    rounded(ctx, -6, -2, 12, 14, 6, color)
    ellipse(ctx, 0, 11, 6.5, 6, "#1c2540")
    ctx.translate(0, 11)
    ctx.rotate(shinAngle)
    rounded(ctx, -5, 0, 10, 13, 5, color)
    ctx.translate(0, 12)
    ctx.rotate(-thighAngle * .25)
    ellipse(ctx, 3, 2, 8, 5, "#20263f")
    ellipse(ctx, 5, 0, 3, 1.5, "rgba(255,255,255,.22)")
    ctx.restore()
  }

  drawArm(ctx, x, y, upperAngle, elbowAngle, sleeve, skin, scale = 1) {
    const upper = 15 * scale
    const lower = 14 * scale
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(upperAngle)
    ctx.strokeStyle = "#202944"; ctx.lineWidth = 12 * scale; ctx.lineCap = "round"
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(upper, 0); ctx.stroke()
    ctx.strokeStyle = sleeve; ctx.lineWidth = 8 * scale; ctx.stroke()
    ellipse(ctx, upper, 0, 6 * scale, 6 * scale, "#202944")
    ctx.translate(upper, 0)
    ctx.rotate(elbowAngle)
    ctx.strokeStyle = "#202944"; ctx.lineWidth = 10 * scale
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(lower, 0); ctx.stroke()
    ctx.strokeStyle = skin; ctx.lineWidth = 7 * scale; ctx.stroke()
    ellipse(ctx, lower, 0, 5.5 * scale, 5 * scale, skin)
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
    const hero = String(this.state.hero || "").toLowerCase()
    const look = clamp(Math.cos(aim) * 2.4, -2.4, 2.4)
    if (["blaze", "pixel"].includes(hero)) {
      // Compact combat robots: metal casing, glowing visor and antenna details.
      rounded(ctx, -24, y - 23, 48, 45, 14, hex(palette.dark))
      rounded(ctx, -20, y - 19, 40, 34, 11, hex(palette.skin))
      rounded(ctx, -15, y - 9, 30, 14, 7, "#17233e")
      rounded(ctx, -11 + look, y - 6, 13, 7, 3, hex(palette.accent))
      ellipse(ctx, -11, y - 15, 5, 3, hex(palette.light), .65)
      ctx.strokeStyle = hex(palette.dark); ctx.lineWidth = 5
      ctx.beginPath(); ctx.moveTo(10, y - 22); ctx.lineTo(16, y - 34); ctx.stroke()
      ellipse(ctx, 17, y - 36, 5, 5, hex(palette.accent))
      rounded(ctx, -10, y + 10, 20, 7, 3, hex(palette.main))
      return
    }
    if (hero === "spark") {
      // The roster also includes a human lightning engineer for silhouette variety.
      ellipse(ctx, 2, y + 5, 24, 25, hex(palette.dark))
      rounded(ctx, -21, y - 20, 42, 42, 17, "#d99268")
      ellipse(ctx, -7, y - 2, 6, 7, "#ffffff"); ellipse(ctx, 7, y - 2, 6, 7, "#ffffff")
      ellipse(ctx, -6 + look, y - 1, 2.5, 3.5, "#263052"); ellipse(ctx, 6 + look, y - 1, 2.5, 3.5, "#263052")
      ctx.fillStyle = hex(palette.main); ctx.beginPath(); ctx.moveTo(-23, y - 6); ctx.lineTo(-18, y - 27); ctx.lineTo(-7, y - 20); ctx.lineTo(1, y - 32); ctx.lineTo(11, y - 20); ctx.lineTo(21, y - 27); ctx.lineTo(23, y - 6); ctx.closePath(); ctx.fill()
      ctx.strokeStyle = "#7d3b31"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(1, y + 7, 8, .2, Math.PI - .2); ctx.stroke()
      return
    }
    if (["frost", "titan", "boulder"].includes(hero)) {
      // Elemental golems use an asymmetric faceted rock/ice silhouette.
      ctx.fillStyle = hex(palette.skin)
      ctx.beginPath()
      ctx.moveTo(-25, y + 9); ctx.lineTo(-22, y - 16); ctx.lineTo(-10, y - 29)
      ctx.lineTo(7, y - 25); ctx.lineTo(24, y - 13); ctx.lineTo(27, y + 10)
      ctx.lineTo(13, y + 24); ctx.lineTo(-12, y + 21); ctx.closePath(); ctx.fill()
      ctx.strokeStyle = hex(palette.dark); ctx.lineWidth = 5; ctx.stroke()
      ctx.fillStyle = hex(palette.light); ctx.globalAlpha = .35
      ctx.beginPath(); ctx.moveTo(-18, y - 13); ctx.lineTo(-8, y - 23); ctx.lineTo(-3, y + 12); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1
      ellipse(ctx, -8, y - 2, 6, 5, hex(palette.accent))
      ellipse(ctx, 10, y - 2, 6, 5, hex(palette.accent))
      rounded(ctx, -9, y + 12, 20, 5, 2, hex(palette.dark))
      return
    }
    if (["viper", "rex"].includes(hero)) {
      // Reptilian hunters have a long snout, plated brow and side spikes.
      ellipse(ctx, 0, y, 25, 27, hex(palette.dark))
      ellipse(ctx, 0, y - 2, 22, 24, hex(palette.skin))
      ctx.fillStyle = hex(palette.main)
      ctx.beginPath(); ctx.moveTo(-20, y - 13); ctx.lineTo(-30, y - 20); ctx.lineTo(-23, y - 4); ctx.closePath(); ctx.fill()
      ctx.beginPath(); ctx.moveTo(20, y - 13); ctx.lineTo(30, y - 20); ctx.lineTo(23, y - 4); ctx.closePath(); ctx.fill()
      ellipse(ctx, -8, y - 7, 7, 8, "#f4f05a")
      ellipse(ctx, 8, y - 7, 7, 8, "#f4f05a")
      rounded(ctx, -2 + look, y - 11, 3, 9, 2, "#17243a")
      rounded(ctx, 9 + look, y - 11, 3, 9, 2, "#17243a")
      ellipse(ctx, 4, y + 11, 19, 10, hex(palette.light))
      ellipse(ctx, -3, y + 8, 2, 2, hex(palette.dark)); ellipse(ctx, 8, y + 8, 2, 2, hex(palette.dark))
      return
    }
    // Shadow and Nova are floating one-eyed cosmic creatures.
    ellipse(ctx, 0, y, 27, 28, hex(palette.dark))
    ctx.fillStyle = hex(palette.skin)
    ctx.beginPath(); ctx.moveTo(-23, y + 8); ctx.quadraticCurveTo(-29, y - 20, 0, y - 28)
    ctx.quadraticCurveTo(29, y - 20, 23, y + 8); ctx.quadraticCurveTo(0, y + 30, -23, y + 8); ctx.fill()
    ellipse(ctx, look, y - 4, 13, 14, "#ffffff")
    ellipse(ctx, look + 2, y - 3, 6, 8, hex(palette.accent))
    ellipse(ctx, look + 3, y - 4, 2.5, 4, "#17203c")
    ctx.strokeStyle = hex(palette.light); ctx.lineWidth = 3
    ctx.beginPath(); ctx.arc(0, y + 8, 10, .2, Math.PI - .2); ctx.stroke()
  }

  drawUniqueHero(ctx, p, hero, gait, time, weaponAngle = 0) {
    const main = hex(p.main), dark = hex(p.dark), accent = hex(p.accent)
    const outlinedRounded = (x,y,w,h,r,fill,stroke=dark,line=4) => { rounded(ctx,x,y,w,h,r,fill);ctx.strokeStyle=stroke;ctx.lineWidth=line;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.stroke() }
    const outlinedEllipse = (x,y,rx,ry,fill,stroke=dark,line=4) => { ellipse(ctx,x,y,rx,ry,fill);ctx.strokeStyle=stroke;ctx.lineWidth=line;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.stroke() }
    const eye = (x, y, r = 5) => { ellipse(ctx, x, y, r, r + 1, "#fff"); ellipse(ctx, x + 1, y, r * .42, r * .55, "#17233d") }
    const bootLegs = color => {
      this.drawLeg(ctx, -11, -18 + Math.max(0, -gait) * 6, gait * .55, color)
      this.drawLeg(ctx, 11, -18 + Math.max(0, gait) * 6, -gait * .55, color)
    }
    const attackPose = Math.sin(this.attackMotion * Math.PI)
    const breathe = Math.sin(time * 2.4 + this.phase * .08)

    if (hero === "shelly") {
      bootLegs("#30264d")
      ctx.fillStyle="#7841aa";ctx.beginPath();ctx.moveTo(-29,-61);ctx.quadraticCurveTo(-37,-37,-23,-13);ctx.lineTo(24,-13);ctx.quadraticCurveTo(36,-38,27,-62);ctx.closePath();ctx.fill();ctx.strokeStyle=dark;ctx.lineWidth=5;ctx.stroke()
      outlinedRounded(-24,-65,48,47,14,"#8b4dc7");rounded(ctx,-18,-59,36,11,6,"rgba(255,255,255,.18)")
      outlinedEllipse(0,-89+breathe*.7,25,26,"#c57b58");ellipse(ctx,-8,-88+breathe*.7,6,7,"#fff");ellipse(ctx,8,-88+breathe*.7,6,7,"#fff");ellipse(ctx,-7,-87+breathe*.7,2.8,4,"#222a46");ellipse(ctx,9,-87+breathe*.7,2.8,4,"#222a46")
      ctx.fillStyle="#542474";ctx.beginPath();ctx.moveTo(-26,-96);ctx.quadraticCurveTo(-15,-119,5,-115);ctx.quadraticCurveTo(26,-111,29,-92);ctx.lineTo(15,-97);ctx.lineTo(5,-83);ctx.lineTo(-5,-96);ctx.lineTo(-25,-84);ctx.closePath();ctx.fill();ctx.strokeStyle="#351747";ctx.lineWidth=4;ctx.stroke()
      rounded(ctx,-8,-75,17,4,2,"#7c3542")
      this.drawArm(ctx,-18,-54,weaponAngle-.15, .5+attackPose*.18,"#8b4dc7","#c57b58",1.02)
      this.drawArm(ctx,17,-53,weaponAngle+.28,-.62-attackPose*.14,"#8b4dc7","#c57b58",1.02)
      ctx.save();ctx.translate(5-this.recoil*10,-48);ctx.rotate(weaponAngle-.07);outlinedRounded(-30,-10,67,20,7,"#313a5b","#171d34",5);rounded(ctx,-20,-6,43,7,3,"#59688b");outlinedRounded(7,-13,34,26,9,"#8d6bb0","#45365d",4);rounded(ctx,36,-7,23,14,5,"#e3b64e");rounded(ctx,-5,8,11,17,4,"#252c47");ctx.restore()
      return
    }
    if (hero === "colt") {
      bootLegs("#27365d")
      outlinedRounded(-23,-65,46,49,13,"#df4650");rounded(ctx,-17,-59,34,13,6,"#f56c72");rounded(ctx,-19,-34,38,8,4,"#26365c");ellipse(ctx,0,-30,5,5,"#ffdf53")
      outlinedEllipse(0,-88+breathe*.65,24,25,"#dc946e");eye(-8,-87+breathe*.65,4.5);eye(8,-87+breathe*.65,4.5);rounded(ctx,-8,-74+breathe*.4,17,4,2,"#8b403a")
      ctx.fillStyle="#2169aa";ctx.beginPath();ctx.moveTo(-24,-94);ctx.lineTo(-18,-113);ctx.lineTo(-7,-104);ctx.lineTo(2,-123);ctx.lineTo(10,-103);ctx.lineTo(20,-113);ctx.lineTo(25,-91);ctx.lineTo(12,-96);ctx.lineTo(1,-84);ctx.lineTo(-9,-97);ctx.closePath();ctx.fill();ctx.strokeStyle="#173b70";ctx.lineWidth=4;ctx.stroke()
      this.drawArm(ctx,-18,-52,weaponAngle+.12,.46+attackPose*.12,"#df4650","#dc946e")
      this.drawArm(ctx,18,-53,weaponAngle-.08,-.5-attackPose*.15,"#df4650","#dc946e")
      ctx.save();ctx.translate(10-this.recoil*9,-48);ctx.rotate(weaponAngle-.06);outlinedRounded(-4,-8,43,16,5,"#3a4767","#172039",4);rounded(ctx,30,-5,15,10,3,"#69c8ff");rounded(ctx,5,6,8,16,3,"#8b4a35");ctx.restore()
      ctx.save();ctx.translate(12-this.recoil*11,-35);ctx.rotate(weaponAngle+.07);outlinedRounded(-3,-7,40,15,5,"#303c5d","#172039",4);rounded(ctx,29,-4,14,9,3,"#69c8ff");rounded(ctx,6,5,8,15,3,"#8b4a35");ctx.restore()
      if (Math.abs(weaponAngle) > .58) {
        outlinedEllipse(0,-88+breathe*.65,24,25,"#dc946e");eye(-8,-87+breathe*.65,4.5);eye(8,-87+breathe*.65,4.5);rounded(ctx,-8,-74+breathe*.4,17,4,2,"#8b403a")
        ctx.fillStyle="#2169aa";ctx.beginPath();ctx.moveTo(-24,-94);ctx.lineTo(-18,-113);ctx.lineTo(-7,-104);ctx.lineTo(2,-123);ctx.lineTo(10,-103);ctx.lineTo(20,-113);ctx.lineTo(25,-91);ctx.lineTo(12,-96);ctx.lineTo(1,-84);ctx.lineTo(-9,-97);ctx.closePath();ctx.fill();ctx.strokeStyle="#173b70";ctx.lineWidth=4;ctx.stroke()
      }
      return
    }
    if (hero === "barley") {
      this.drawLeg(ctx,-11,-17+gait*3,gait*.35,"#28364d");this.drawLeg(ctx,11,-17-gait*3,-gait*.35,"#28364d")
      outlinedRounded(-27,-68,54,52,16,"#334862");rounded(ctx,-21,-62,42,37,11,"#4ba9df");rounded(ctx,-16,-57,32,9,5,"rgba(255,255,255,.2)");outlinedEllipse(0,-41,10,11,"#ffcf45","#26364c",3)
      ctx.save();ctx.translate(0,breathe*.75);outlinedRounded(-23,-108,46,45,15,"#dcecf2");rounded(ctx,-18,-99,36,18,8,"#273950");ellipse(ctx,-8,-90,5,5,"#ffe763");ellipse(ctx,8,-90,5,5,"#ffe763");ellipse(ctx,-7,-91,2,2,"#fff");rounded(ctx,-12,-76,24,5,2,"#7894a1");ctx.restore()
      ctx.strokeStyle="#26364c";ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(0,-108);ctx.lineTo(0,-117);ctx.stroke();ellipse(ctx,0,-120,5,5,"#ffcf45")
      this.drawArm(ctx,-21,-55,-2.55-gait*.12,.35,"#4ba9df","#91aebb",.92)
      this.drawArm(ctx,20,-55,weaponAngle-.55-attackPose*.28,.3,"#4ba9df","#91aebb",.92)
      ctx.save();ctx.translate(30-this.recoil*7,-49);ctx.rotate(weaponAngle-.38-Math.sin(this.attackMotion*Math.PI)*.22);outlinedRounded(-8,-16,16,33,6,"#365370","#203049",4);outlinedRounded(5,-22,17,30,6,"#4bb7ef","#245174",3);rounded(ctx,8,-18,11,8,3,"rgba(255,255,255,.45)");rounded(ctx,10,-28,7,9,2,"#edfaff");ctx.restore()
      return
    }

    if (hero === "blaze") {
      // Kira: every large piece is animated independently like a compact 2D skeleton.
      bootLegs("#252a42")
      for (let i = 0; i < 3; i += 1) { ctx.fillStyle = ["#68208c","#9b2db9","#d63be2"][i]; ctx.beginPath(); ctx.moveTo(-16 + i * 8,-61); ctx.quadraticCurveTo(-43 + i * 7,-35 + Math.sin(time * 2.3 + i) * 3,-34 + i * 10,0); ctx.lineTo(-8 + i * 7,-22); ctx.closePath(); ctx.fill() }
      rounded(ctx, -23, -63, 46, 47, 12, "#303545"); rounded(ctx, -17, -58, 34, 28, 7, main)
      rounded(ctx, -27, -57, 13, 23, 5, "#171e30"); ellipse(ctx, 20, -50, 12, 14, "#737d8f")
      ellipse(ctx, 0, -85, 23, 24, "#d99671"); ctx.fillStyle = "#552057"; ctx.beginPath(); ctx.moveTo(-23,-90); ctx.quadraticCurveTo(-8,-117,18,-104); ctx.lineTo(27,-91); ctx.lineTo(6,-97); ctx.lineTo(-8,-82); ctx.closePath(); ctx.fill()
      eye(-8, -85, 4); eye(8, -85, 4); rounded(ctx, -7, -73, 16, 3, 2, "#7d3142")
      ctx.save(); ctx.translate(8 - this.recoil * 7,-43); ctx.rotate(-.12 + this.recoil * .05); rounded(ctx,-28,-10,61,21,7,"#151c2b"); rounded(ctx,-22,-7,49,14,5,"#4e4264"); for(let i=0;i<5;i+=1) ellipse(ctx,-13+i*8,-1,3,3,i===4?"#fff":accent); rounded(ctx,25,-5,19,10,3,"#232b3e"); rounded(ctx,-4,7,10,15,3,"#202638"); ctx.restore()
      return
    }
    if (hero === "frost") {
      bootLegs("#142944"); rounded(ctx,-24,-64,48,47,11,"#e9f5ff"); rounded(ctx,-19,-59,38,35,8,"#247fc0"); ellipse(ctx,0,-41,8,9,accent)
      ellipse(ctx,0,-84,22,23,"#c98262"); eye(-7,-84,4); eye(7,-84,4)
      ctx.fillStyle="#f13b9b"; ctx.beginPath(); ctx.moveTo(-15,-99); ctx.lineTo(-9,-123); ctx.lineTo(-1,-103); ctx.lineTo(7,-128); ctx.lineTo(15,-101); ctx.lineTo(22,-111); ctx.lineTo(18,-91); ctx.closePath(); ctx.fill()
      for(const side of [-1,1]) { const swing=side*gait*.18; ctx.save(); ctx.translate(side*20,-53); ctx.rotate(side*.18+swing); rounded(ctx,side<0?-22:0,-6,22,13,5,"#dcecff"); rounded(ctx,side<0?-31:9,-8,31,17,6,"#1b2940"); rounded(ctx,side<0?-27:12,-5,22,7,3,accent); ellipse(ctx,side<0?-29:31,0,5,5,"#091526"); ctx.restore() }
      rounded(ctx,-17,-73,34,6,3,"#16243a"); rounded(ctx,-10,-71,20,3,2,accent)
      return
    }
    if (hero === "viper") {
      // Vulkan: no human anatomy—four volcanic masses around a molten core.
      this.drawLeg(ctx, -16, -17 + gait * 2, 0, "#392f35"); this.drawLeg(ctx, 16, -17 - gait * 2, 0, "#392f35")
      ellipse(ctx, 0, -48, 38, 38, "#302c32"); ellipse(ctx, 0, -48, 22, 25, "#ff682c"); ellipse(ctx, 0, -48, 11, 15, "#ffe25c")
      ellipse(ctx, -38, -50, 23, 27, "#44333a"); ellipse(ctx, 39, -47, 25, 29, "#44333a")
      ellipse(ctx, -43, -28, 20, 17, "#342a31"); ellipse(ctx, 44, -26, 21, 18, "#342a31")
      ctx.fillStyle = "#44333a"; ctx.beginPath(); ctx.moveTo(-25, -76); ctx.lineTo(-12, -105); ctx.lineTo(16, -101); ctx.lineTo(29, -75); ctx.closePath(); ctx.fill()
      rounded(ctx, -16, -93, 32, 15, 6, "#241f28"); ellipse(ctx, -8, -86, 5, 4, "#ffb32e"); ellipse(ctx, 8, -86, 5, 4, "#ffb32e")
      ctx.strokeStyle = "#ff7b31"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-20, -70); ctx.lineTo(-8, -55); ctx.lineTo(-16, -34); ctx.moveTo(22, -68); ctx.lineTo(9, -52); ctx.stroke()
      rounded(ctx,-36,-27,72,13,5,"#382c23"); rounded(ctx,-12,-31,24,20,5,"#d69a31"); ellipse(ctx,0,-21,6,6,"#ffdd59")
      return
    }
    if (hero === "titan") {
      bootLegs("#18253c"); ctx.fillStyle="#294f3e"; ctx.beginPath(); ctx.moveTo(-25,-68);ctx.lineTo(25,-68);ctx.lineTo(20,-21);ctx.lineTo(-20,-21);ctx.closePath();ctx.fill(); rounded(ctx,-22,-61,44,36,9,"#3e865b"); rounded(ctx,-18,-52,36,7,3,"#1f4635")
      ctx.fillStyle="rgba(91,255,207,.38)"; ctx.beginPath();ctx.moveTo(-27,-73);ctx.lineTo(0,-114);ctx.lineTo(27,-73);ctx.lineTo(18,-60);ctx.lineTo(-18,-60);ctx.closePath();ctx.fill(); rounded(ctx,-15,-79,30,21,8,"#142437"); rounded(ctx,-9,-70,18,4,2,accent)
      for(let side of [-1,1]) { rounded(ctx,side<0?-31:18,-54,13,31,6,"#2e7652") }
      ctx.strokeStyle="#2c765b";ctx.lineWidth=11;ctx.lineCap="round";ctx.beginPath();ctx.moveTo(-8,-25);for(let i=0;i<5;i+=1){const x=-18-i*9,y=-15+Math.sin(time*2+i*.7)*4+i*3;ctx.lineTo(x,y);ellipse(ctx,x,y,6,6,i%2?main:dark)}ctx.stroke()
      for(let i=0;i<3;i+=1){const a=time*1.4+i*Math.PI*2/3,x=Math.cos(a)*42,y=-48+Math.sin(a)*18;ctx.save();ctx.translate(x,y);ctx.rotate(a);ellipse(ctx,0,0,12,4,accent,.75);ellipse(ctx,0,0,5,2,"#fff",.8);ctx.restore()}
      return
    }
    if (hero === "shadow") {
      ellipse(ctx,0,-45,33,38,"#39783d"); ellipse(ctx,-4,-49,27,32,main); rounded(ctx,-28,-55,56,30,9,"#572b79"); rounded(ctx,-22,-49,44,7,3,"#a957d3")
      eye(-9,-53,5); eye(9,-53,5); rounded(ctx,-8,-39,18,4,2,"#21452b")
      for(let i=0;i<14;i+=1){const a=i*Math.PI*2/14,x=Math.cos(a)*29,y=-47+Math.sin(a)*34;ctx.fillStyle="#e9f1b0";ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(a)*8,y+Math.sin(a)*8);ctx.lineTo(x-Math.sin(a)*3,y+Math.cos(a)*3);ctx.closePath();ctx.fill()}
      for(const side of [-1,1]){ctx.strokeStyle=main;ctx.lineWidth=12;ctx.lineCap="round";ctx.beginPath();ctx.moveTo(side*22,-48);ctx.quadraticCurveTo(side*39,-35,side*35,-15+gait*3*side);ctx.stroke()}
      ctx.save();ctx.translate(Math.sin(time*1.7)*3,-88+Math.sin(time*2)*2);ctx.rotate(Math.sin(time*1.5)*.12);ctx.strokeStyle="#3b8a45";ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(0,15);ctx.lineTo(0,0);ctx.stroke();for(let i=0;i<7;i+=1){const a=i*Math.PI*2/7;ellipse(ctx,Math.cos(a)*11,Math.sin(a)*8,7,5,"#f27ac8")}ellipse(ctx,0,0,5,5,"#ffe263");ctx.restore();ellipse(ctx,-13,-6,11,6,"#274c31");ellipse(ctx,13,-6,11,6,"#274c31")
      return
    }
    if (hero === "spark") {
      // Reaper: three cape bones trail with delayed phases.
      for(let i=0;i<3;i+=1){ctx.fillStyle=["#171322","#241832","#342040"][i];ctx.beginPath();ctx.moveTo(-24+i*17,-69);ctx.quadraticCurveTo(-38+i*26,-35+Math.sin(time*2+i)*4,-34+i*33,2);ctx.lineTo(-8+i*15,-18);ctx.closePath();ctx.fill()}
      ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(-26, -81); ctx.lineTo(0, -112); ctx.lineTo(27, -80); ctx.lineTo(19, -54); ctx.lineTo(-19, -54); ctx.closePath(); ctx.fill()
      rounded(ctx, -18, -85, 36, 28, 10, "#dedbf2"); ellipse(ctx,-8,-75,4,5,accent);ellipse(ctx,8,-75,4,5,accent)
      ctx.strokeStyle = "#5f6474"; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(21, -61); ctx.lineTo(43, -14); ctx.lineTo(55, -71); ctx.stroke()
      ctx.strokeStyle = accent; ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(45, -73, 26, -2.2, .7); ctx.stroke(); ellipse(ctx, 0, -43, 9, 9, accent, .55)
      ctx.save();ctx.translate(-34,-25+Math.sin(time*2)*3);rounded(ctx,-7,-11,14,22,5,"#25332b");ellipse(ctx,0,0,5,8,accent,.7);ctx.restore()
      for(let i=0;i<3;i+=1){const a=time*2+i*2.1;ctx.fillStyle="rgba(79,255,128,.65)";ctx.beginPath();ctx.moveTo(Math.cos(a)*35,-38+Math.sin(a)*16);ctx.lineTo(Math.cos(a)*35-7,-34+Math.sin(a)*16);ctx.lineTo(Math.cos(a)*35,-31+Math.sin(a)*16);ctx.fill()}
      return
    }
    if (hero === "nova") {
      ctx.shadowColor="#f57cd6";ctx.shadowBlur=9;ellipse(ctx,0,3,34,7,"#f57cd6",.25);ctx.shadowBlur=0
      for(let i=0;i<4;i+=1){ctx.fillStyle=["#762b82","#ad3d9a","#db59b5","#f28bd0"][i];ctx.beginPath();ctx.ellipse(0,-11-i*9,34-i*3,15,0,0,Math.PI*2);ctx.fill()}
      rounded(ctx,-18,-68,36,39,10,"#e95dad");rounded(ctx,-4,-65,8,31,4,"#f8d36a");ellipse(ctx,0,-88,22,23,"#d99873");ctx.fillStyle="#f0d7f2";ctx.beginPath();ctx.arc(0,-95,23,Math.PI,Math.PI*2);ctx.fill();eye(-7,-88,4);eye(7,-88,4)
      ctx.save();ctx.translate(19-this.recoil*5,-53);ctx.rotate(-.28);rounded(ctx,-6,-5,52,11,4,"#1d4f83");rounded(ctx,17,-8,28,17,6,"#378bd0");rounded(ctx,42,-4,15,8,3,"#152d4a");ctx.strokeStyle="#2d6eac";ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(-1,-42);ctx.stroke();ctx.fillStyle="#4899db";ctx.beginPath();ctx.arc(-1,-42,29,Math.PI,Math.PI*2);ctx.lineTo(-1,-42);ctx.fill();ctx.strokeStyle="#d8edff";ctx.lineWidth=2;for(let a=0;a<=Math.PI;a+=Math.PI/4){ctx.beginPath();ctx.moveTo(-1,-42);ctx.lineTo(-1+Math.cos(a)*29,-42-Math.sin(a)*29);ctx.stroke()}ctx.restore()
      return
    }
    if (hero === "rex") {
      // Zero: small human core framed by two independently articulated steel manipulators.
      bootLegs("#20243a"); rounded(ctx, -21, -61, 42, 43, 13, "#9d2948"); ellipse(ctx, 0, -82, 23, 24, "#d59070")
      ctx.fillStyle = "#202239"; ctx.beginPath(); ctx.arc(0, -91, 25, Math.PI, Math.PI * 2); ctx.lineTo(8, -83); ctx.lineTo(-18, -80); ctx.closePath(); ctx.fill(); eye(8, -83, 5)
      for (const side of [-1, 1]) { let px=side*14,py=-57; for(let i=0;i<7;i+=1){const a=-1.48+side*(.23+i*.16)+Math.sin(time*1.8+i*.5)*.025;const nx=px+Math.cos(a)*13,ny=py+Math.sin(a)*13;ctx.strokeStyle="#2c3446";ctx.lineWidth=11;ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(nx,ny);ctx.stroke();ellipse(ctx,nx,ny,6,6,i%2?"#758196":accent);px=nx;py=ny} for(let f=-1;f<=1;f+=1){ctx.strokeStyle="#8994a4";ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px+side*(9+Math.abs(f)*3),py+f*8);ctx.stroke()} }
      ellipse(ctx, 0, -44, 8, 8, accent)
      return
    }
    if (hero === "pixel") {
      // Vector: modular non-human mech with triangular quantum core and digitigrade legs.
      ctx.strokeStyle = "#252e48"; ctx.lineWidth = 12; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(-13, -29); ctx.lineTo(-18, -5); ctx.lineTo(-28, 3); ctx.moveTo(13, -29); ctx.lineTo(18, -5); ctx.lineTo(28, 3); ctx.stroke()
      ctx.fillStyle = "#17243c"; ctx.beginPath(); ctx.moveTo(-32,-69);ctx.lineTo(31,-69);ctx.lineTo(24,-23);ctx.lineTo(0,-12);ctx.lineTo(-25,-23);ctx.closePath();ctx.fill()
      ctx.fillStyle = "#d83b3b";ctx.beginPath();ctx.moveTo(-26,-64);ctx.lineTo(2,-68);ctx.lineTo(3,-22);ctx.lineTo(-21,-29);ctx.closePath();ctx.fill();ctx.fillStyle="#3377c9";ctx.beginPath();ctx.moveTo(2,-68);ctx.lineTo(26,-62);ctx.lineTo(20,-29);ctx.lineTo(3,-22);ctx.closePath();ctx.fill()
      ctx.save();ctx.translate(0,-43);ctx.rotate(time*.8);ctx.fillStyle="#70eaff";ctx.fillRect(-8,-8,16,16);ctx.strokeStyle="#fff";ctx.lineWidth=2;ctx.strokeRect(-8,-8,16,16);ctx.restore()
      rounded(ctx,-22,-99,44,31,8,"#43516b");ellipse(ctx,-8,-84,7,6,"#ffd946");ellipse(ctx,8,-84,7,6,"#ffd946");rounded(ctx,-5,-75,10,4,2,"#d83b3b")
      rounded(ctx,-43,-61,17,37,6,"#d83b3b");rounded(ctx,26,-61,17,37,6,"#3377c9");for(const x of [-34,34]){ellipse(ctx,x,-48,6,6,"#1a273d");rounded(ctx,x-5,-37,10,17,4,"#657289")}
      return
    }
    // Toxin: articulated wing-hands, high collar, beaked mask and poison payload.
    bootLegs("#302b35"); ctx.fillStyle = "#302a34"; ctx.beginPath(); ctx.moveTo(-26, -67); ctx.lineTo(24, -67); ctx.lineTo(39, -8); ctx.lineTo(10, -20); ctx.lineTo(0, 0); ctx.lineTo(-12, -20); ctx.lineTo(-39, -8); ctx.closePath(); ctx.fill()
    rounded(ctx, -25, -72, 50, 43, 14, "#514033"); ctx.fillStyle = "#e1d7b7"; ctx.beginPath(); ctx.moveTo(-21, -88); ctx.quadraticCurveTo(0, -111, 22, -87); ctx.lineTo(42, -75); ctx.lineTo(17, -65); ctx.lineTo(-18, -66); ctx.closePath(); ctx.fill()
    ellipse(ctx, -9, -84, 7, 8, "#172323"); ellipse(ctx, 10, -84, 7, 8, "#172323"); ellipse(ctx, -8, -84, 3, 4, accent); ellipse(ctx, 11, -84, 3, 4, accent)
    for(const side of [-1,1]){ctx.save();ctx.translate(side*20,-55);ctx.rotate(side*(.35+Math.sin(time*2)*.05));for(let i=0;i<4;i+=1){ctx.strokeStyle="#594839";ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(0,i*5);ctx.lineTo(side*(18+i*4),-13+i*8);ctx.stroke();ctx.fillStyle=i%2?"#304b34":"#3f6340";ctx.beginPath();ctx.moveTo(side*(12+i*4),-16+i*8);ctx.lineTo(side*(28+i*5),-20+i*8);ctx.lineTo(side*(20+i*4),-7+i*8);ctx.fill()}ctx.restore()}
    for(const x of [-10,0,10]){rounded(ctx,x-4,-46,8,22,3,"#1e2826");ellipse(ctx,x,-40,3,8,accent,.75)}
    ctx.save();ctx.translate(29-this.recoil*4,-34);ctx.rotate(-.18);rounded(ctx,-5,-6,36,13,4,"#34303a");rounded(ctx,14,-4,23,8,3,accent);ctx.restore()
  }

  drawBodyRig(ctx, palette, hero, gait) {
    if (["shadow", "nova"].includes(hero)) {
      // Floating creatures use energy tendrils instead of human legs.
      ctx.strokeStyle = hex(palette.dark); ctx.lineWidth = 10; ctx.lineCap = "round"
      ctx.beginPath(); ctx.moveTo(-9, -23); ctx.quadraticCurveTo(-19, -5 + gait * 3, -13, 8); ctx.moveTo(9, -23); ctx.quadraticCurveTo(19, -5 - gait * 3, 13, 8); ctx.stroke()
      ellipse(ctx, 0, -38, 28, 31, hex(palette.dark)); ellipse(ctx, 0, -41, 23, 27, hex(palette.main))
      ellipse(ctx, -8, -49, 8, 13, hex(palette.light), .25)
      rounded(ctx, -19, -35, 38, 8, 4, hex(palette.accent))
      ellipse(ctx, 0, -7, 13, 6, hex(palette.accent), .35)
      return
    }
    if (["blaze", "pixel"].includes(hero)) {
      // Robots have a rigid chassis, piston legs and luminous reactor core.
      this.drawLeg(ctx, -10, -17 + Math.max(0, -gait) * 5, gait * .3, "#28334c")
      this.drawLeg(ctx, 10, -17 + Math.max(0, gait) * 5, -gait * .3, "#28334c")
      rounded(ctx, -27, -63, 54, 49, 12, hex(palette.dark)); rounded(ctx, -23, -59, 46, 39, 9, hex(palette.main))
      rounded(ctx, -18, -53, 36, 9, 4, "rgba(255,255,255,.2)")
      ellipse(ctx, 0, -34, 10, 10, "#16213c"); ellipse(ctx, 0, -34, 6, 6, hex(palette.accent))
      rounded(ctx, -31, -49, 9, 24, 4, "#222d47"); rounded(ctx, 22, -49, 9, 24, 4, "#222d47")
      return
    }
    if (["titan", "boulder", "frost"].includes(hero)) {
      // Golems are broad, asymmetric and built from separate elemental chunks.
      this.drawLeg(ctx, -13, -19 + Math.max(0, -gait) * 4, gait * .22, hex(palette.dark))
      this.drawLeg(ctx, 13, -19 + Math.max(0, gait) * 4, -gait * .22, hex(palette.dark))
      ellipse(ctx, 0, -39, 33, 32, hex(palette.dark)); ellipse(ctx, 0, -41, 28, 27, hex(palette.main))
      ellipse(ctx, -30, -48, 16, 18, hex(palette.skin)); ellipse(ctx, 30, -45, 18, 20, hex(palette.skin))
      ctx.strokeStyle = hex(palette.light); ctx.globalAlpha = .38; ctx.lineWidth = 4
      ctx.beginPath(); ctx.moveTo(-12, -58); ctx.lineTo(-3, -43); ctx.lineTo(-10, -28); ctx.moveTo(12, -55); ctx.lineTo(5, -39); ctx.stroke(); ctx.globalAlpha = 1
      ellipse(ctx, 0, -38, 8, 8, hex(palette.accent))
      return
    }
    if (["viper", "rex"].includes(hero)) {
      // Reptiles lean forward and have a visible counterbalancing tail.
      ctx.strokeStyle = hex(palette.dark); ctx.lineWidth = 16; ctx.lineCap = "round"
      ctx.beginPath(); ctx.moveTo(-10, -25); ctx.quadraticCurveTo(-38, -17, -43, 4 + gait * 3); ctx.stroke()
      this.drawLeg(ctx, -10, -16 + Math.max(0, -gait) * 8, gait * .8, hex(palette.dark))
      this.drawLeg(ctx, 10, -16 + Math.max(0, gait) * 8, -gait * .8, hex(palette.dark))
      ellipse(ctx, 0, -37, 25, 31, hex(palette.dark)); ellipse(ctx, 2, -39, 21, 27, hex(palette.main))
      ctx.fillStyle = hex(palette.light); ctx.beginPath(); ctx.moveTo(-20, -48); ctx.lineTo(-31, -43); ctx.lineTo(-20, -34); ctx.closePath(); ctx.fill()
      rounded(ctx, -18, -35, 36, 7, 3, hex(palette.accent))
      return
    }
    // Spark remains a nimble human engineer with a compact armored vest.
    this.drawLeg(ctx, -9, -16 + Math.max(0, -gait) * 7, gait * .7, hex(palette.dark))
    this.drawLeg(ctx, 9, -16 + Math.max(0, gait) * 7, -gait * .7, "#34436b")
    ellipse(ctx, 0, -35, 25, 29, hex(palette.dark)); rounded(ctx, -21, -60, 42, 43, 15, hex(palette.main))
    ellipse(ctx, -10, -47, 8, 12, hex(palette.light), .32); rounded(ctx, -19, -32, 38, 5, 3, hex(palette.accent))
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
    rounded(ctx, -28, -98, 56, 10, 5, "#11182d")
    ctx.fillStyle = health < 0.35 ? "#ff4b57" : health < 0.65 ? "#ffc934" : "#55df57"
    ctx.beginPath(); ctx.roundRect(-25, -95, 50 * health, 4, 2); ctx.fill()
    ctx.fillStyle = "rgba(255,255,255,.55)"
    ctx.beginPath(); ctx.roundRect(-23, -94, 46 * health, 1, 1); ctx.fill()

    const ammo = Math.max(0, Math.min(3, Math.ceil(this.state.ammo ?? 3)))
    for (let index = 0; index < 3; index += 1) {
      rounded(ctx, -17 + index * 12, -85, 9, 4, 2, index < ammo ? "#f4c83d" : "#29334d")
    }
  }
}
