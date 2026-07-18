import {BotAI} from "./BotAI"

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const worldAngleFromScreen = angle => Math.atan2(Math.sin(angle) / .66, Math.cos(angle))
const circleHitsRect = (x, y, radius, wall) => {
  const closestX = clamp(x, wall.minX, wall.maxX), closestY = clamp(y, wall.minY, wall.maxY)
  return (x - closestX) ** 2 + (y - closestY) ** 2 < radius ** 2
}
const circleHitsCircle = (ax, ay, ar, bx, by, br) => (ax - bx) ** 2 + (ay - by) ** 2 <= (ar + br) ** 2
const blocksMovement = wall => wall.type !== "bush" && wall.type !== "half"
const HERO_MOVE_RADII = {blaze:14,frost:14,viper:18,titan:13,shadow:14,spark:13,nova:12,rex:15,pixel:14,boulder:13}
const segmentHitsCircle = (x1, y1, x2, y2, cx, cy, radius) => {
  const dx = x2 - x1, dy = y2 - y1
  const lengthSq = dx * dx + dy * dy
  const t = lengthSq ? clamp(((cx - x1) * dx + (cy - y1) * dy) / lengthSq, 0, 1) : 0
  return Math.hypot(cx - (x1 + dx * t), cy - (y1 + dy * t)) <= radius
}
const segmentHitsRect = (x1, y1, x2, y2, radius, wall) => {
  const distance = Math.hypot(x2 - x1, y2 - y1)
  const steps = Math.max(1, Math.ceil(distance / Math.max(4, radius)))
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    if (circleHitsRect(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, radius, wall)) return true
  }
  return false
}

export class LocalBattleEngine {
  constructor(state, onUpdate) {
    this.state = state
    this.onUpdate = onUpdate
    this.moveVector = {x: 0, y: 0}
    this.running = false
    this.lastAt = 0
    this.lastUiAt = 0
    this.botAIs = new Map()
    this.attackAt = {}
    this.cooldowns = {primary: 0, secondary: 0}
    this.stats = {kills: 0, monsters: 0}
    this.hitstop = 0
    this.frame = null
  }

  start() {
    this.running = true
    this.lastAt = performance.now()
    this.frame = requestAnimationFrame(this.tick)
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.frame)
  }

  move = (x, y) => { this.moveVector = {x, y} }

  rotate = rotation => {
    const player = this.state.players["demo-player"]
    if (player) player.rotation = worldAngleFromScreen(rotation)
  }

  setAiming = aiming => {
    const player = this.state.players["demo-player"]
    if (player) player.aiming = Boolean(aiming)
  }

  shoot = (angle, aimDistance = Infinity) => {
    const player = this.state.players["demo-player"]
    if (!player || player.dead) return
    this.performAttack("demo-player", worldAngleFromScreen(angle), performance.now(), aimDistance)
  }

  performAttack(owner, angle, now, aimDistance = Infinity) {
    const source = this.state.players[owner]
    if (!source || source.dead) return false
    const hero = String(source.hero || "blaze").toLowerCase()
    const cooldowns = {blaze:520,frost:620,viper:790,titan:650,shadow:720,spark:540,nova:860,rex:480,pixel:650,boulder:590}
    const heatRate = hero === "frost" ? Math.max(.55, 1 - (source.heat || 0) * .075) : 1
    if (now - (this.attackAt[owner] || 0) < (cooldowns[hero] || 700) * heatRate) return false
    this.attackAt[owner] = now
    source.rotation = angle
    source.attackPulse = (source.attackPulse || 0) + 1

    if(hero==="blaze")[-.28,-.14,0,.14,.28].forEach(o=>this.spawnBullet(owner,angle+o,source.color,260,{kind:"pellet",speed:590,size:6,life:.75}))
    else if(hero==="frost")[-.035,-.02,-.008,.008,.02,.035].forEach(o=>this.spawnBullet(owner,angle+o,source.heat>=5?"#ff8b3d":"#54f2ff",180,{kind:source.heat>=5?"firebeam":"laser",speed:690,acceleration:420,size:4,life:.95,pierce:source.heat>=5?2:0,ignite:source.heat>=5}))
    else if(hero==="viper"){
      const hits=this.meleeAttack(owner,angle,145,.72,1250,"slam","#ff7138",target=>{target.slow=1.2;source.shieldStacks=Math.min(5,(source.shieldStacks||0)+1);source.shieldDuration=4})
      if(!hits)this.createRockCover(source.x+Math.cos(angle)*92,source.y+Math.sin(angle)*92,owner)
    }
    else if(hero==="titan"){const disc=this.state.bullets.find(b=>b.playerId===owner&&b.kind==="boomerang"&&b.life>0);if(disc&&source.grounded<=0){source.x=disc.x;source.y=disc.y;disc.life=0;this.radialAttack(owner,105,600,"rewind","#58f6e9");this.impact(10,.025)}else this.spawnBullet(owner,angle,"#58f6e9",650,{kind:"boomerang",speed:520,acceleration:260,size:11,life:1.65,pierce:1})}
    else if(hero==="shadow"){
      if(aimDistance<54){this.tryMove(source,Math.cos(angle)*210,Math.sin(angle)*210,{vault:true});source.airborne=.55;this.addEffect({kind:"vine",x:source.x,y:source.y,radius:88,color:"#b5ff70",life:.55})}
      else this.spawnBullet(owner,angle,"#75d947",750,{kind:"spore",speed:450,size:15,life:1.15,splash:115})
    }
    else if(hero==="spark"){this.tryMove(source,Math.cos(angle)*135,Math.sin(angle)*135);let before=this.stats.kills;this.meleeAttack(owner,angle,135,.95,1050,"slash","#7dff63",()=>{source.souls=Math.min(3,(source.souls||0)+1)});if(source.souls>=3){source.souls=0;source.deflect=1;this.radialAttack(owner,105,600,"spin","#d9ff8b")}if(before!==this.stats.kills)this.attackAt[owner]=0}
    else if(hero==="nova")this.spawnBullet(owner,angle,"#70eaff",900,{kind:"sniper",speed:860,size:4,life:1.35,pierce:0,scaling:true})
    else if(hero==="rex"){
      const vaulted=this.wallAhead(source,angle,82)
      if(vaulted){this.tryMove(source,Math.cos(angle)*155,Math.sin(angle)*155,{vault:true});source.airborne=.42;this.addEffect({kind:"thruster",x:source.x,y:source.y,radius:75,color:"#7be8ff",life:.4})}
      else this.meleeAttack(owner,angle,92,.82,1200,"slash","#4bc7ff")
    }
    else if(hero==="pixel"){
      const evolved=(source.evolution||0)>=4
      this.spawnBullet(owner,angle,"#ffdf4b",850,{kind:evolved?"chain":"quantum",speed:580,size:10,life:1.2,splash:75,pierce:evolved?1:0,chain:evolved?4:0,bounces:evolved?2:0})
    }
    else[-.18,0,.18].forEach(o=>this.spawnBullet(owner,angle+o,"#65e357",320,{kind:"poison",speed:600,size:5,life:1.15,poison:640}))
    return true
  }

  enemyTargets(owner) {
    const source = this.state.players[owner]
    const targets = Object.entries(this.state.players).filter(([id, target]) => id !== owner && !target.dead && (!source.team || !target.team || target.team !== source.team))
      .map(([id, target]) => ({id, target, monster: false}))
    Object.entries(this.state.monsters || {}).forEach(([id, target]) => targets.push({id, target, monster: true}))
    return targets
  }

  hitTarget(item, damage, owner) {
    const target = item.target
    damage = Math.round(damage * (this.state.players[owner]?.damageMultiplier || 1))
    if(target.invulnerable>0)return
    if(target.stealth>0&&(target.dodges||0)>0){target.dodges-=1;this.radialAttack(item.id,105,520,"spin","#d9fff7");this.addEffect({kind:"evade",x:target.x,y:target.y,damage:"EVADE",color:"#7effee",life:.55});return}
    const stackReduction=Math.min(.75,(target.shieldStacks||0)*.15)
    const applied = item.monster ? damage : Math.round(damage * (target.shield > 0 ? .6 : 1) * (1-stackReduction))
    target.lives = Math.max(0, target.lives - applied)
    target.regenBlocked=3
    target.hitFlash = .18
    target.stun = Math.max(target.stun || 0, damage >= 1600 ? .16 : 0)
    this.impact(damage >= 1600 ? 9 : 3, damage >= 1600 ? .025 : 0)
    this.addEffect({kind:"damage",x:target.x,y:target.y,damage:applied,color:item.monster?"#ffe55c":"#fff",life:.72})
    const attacker = this.state.players[owner]
    this.registerHit(attacker, target, owner, item.id)
    if (!target.lives) {
      if (item.monster) this.defeatMonster(item.id, target, owner)
      else {
        target.dead = true
        if (owner === "demo-player") this.stats.kills += 1
        const attackerHero=String(attacker?.hero||"").toLowerCase()
        if(attackerHero==="blaze")this.cooldowns.secondary=0
      }
    }
  }

  registerHit(attacker, target, owner, targetId) {
    if(!attacker||owner===targetId)return
    attacker.superCharge=Math.min(100,(attacker.superCharge||0)+20)
    if(String(attacker.hero||"").toLowerCase()==="frost"){attacker.heat=Math.min(5,(attacker.heat||0)+1);attacker.heatTime=2.2}
  }

  addEffect(effect) {
    this.state.effects ??= []
    this.state.effects.push({...effect, maxLife: effect.life || .45})
  }

  impact(shake=6, freeze=.02) {
    this.state.combatShake=Math.max(this.state.combatShake||0,shake)
    this.hitstop=Math.max(this.hitstop,freeze)
  }

  pullTargets(owner,x,y,radius,distance,ground=0) {
    this.enemyTargets(owner).forEach(({target})=>{const d=Math.hypot(x-target.x,y-target.y);if(d>radius||!d)return;target.x+=((x-target.x)/d)*Math.min(distance,d);target.y+=((y-target.y)/d)*Math.min(distance,d);target.grounded=Math.max(target.grounded||0,ground)})
  }

  pullConeTargets(owner,x,y,angle,radius,halfArc,distance) {
    this.enemyTargets(owner).forEach(({target})=>{const dx=target.x-x,dy=target.y-y,d=Math.hypot(dx,dy);const delta=Math.atan2(Math.sin(Math.atan2(dy,dx)-angle),Math.cos(Math.atan2(dy,dx)-angle));if(!d||d>radius||Math.abs(delta)>halfArc)return;target.x-=dx/d*Math.min(distance,d);target.y-=dy/d*Math.min(distance,d)})
    this.addEffect({kind:"cone",x,y,angle,range:radius,arc:halfArc,color:"#d992ff",life:.42})
  }

  meleeAttack(owner, angle, range, arc, damage, kind, color, onHit) {
    const source = this.state.players[owner]
    let hits=0
    this.enemyTargets(owner).forEach(item => {
      const dx = item.target.x - source.x
      const dy = item.target.y - source.y
      const delta = Math.atan2(Math.sin(Math.atan2(dy, dx) - angle), Math.cos(Math.atan2(dy, dx) - angle))
      if (circleHitsCircle(source.x,source.y,range,item.target.x,item.target.y,item.target.radius||14) && Math.abs(delta) <= arc) { this.hitTarget(item, damage, owner); onHit?.(item.target);hits+=1 }
    })
    this.addEffect({kind, x: source.x, y: source.y, angle, range, arc, color, life: .34})
    return hits
  }

  radialAttack(owner, radius, damage, kind, color, centerX, centerY) {
    const source = this.state.players[owner]
    const x = centerX ?? source.x
    const y = centerY ?? source.y
    this.enemyTargets(owner).forEach(item => {
      if (Math.hypot(item.target.x - x, item.target.y - y) <= radius) this.hitTarget(item, damage, owner)
    })
    this.addEffect({kind, x, y, radius, color, life: .5})
  }

  chainPrimary(owner, range, count) {
    const source = this.state.players[owner]
    const hits = this.enemyTargets(owner).filter(item => Math.hypot(item.target.x - source.x, item.target.y - source.y) <= range)
      .sort((a, b) => Math.hypot(a.target.x - source.x, a.target.y - source.y) - Math.hypot(b.target.x - source.x, b.target.y - source.y)).slice(0, count)
    let from = source
    hits.forEach(item => { this.hitTarget(item, 650, owner); this.addEffect({kind: "lightning", x: from.x, y: from.y, toX: item.target.x, toY: item.target.y, color: "#65efff", life: .26}); from = item.target })
  }

  beamAttack(owner, angle, range, damage) {
    const source = this.state.players[owner]
    let best = null
    this.enemyTargets(owner).forEach(item => {
      const dx = item.target.x - source.x
      const dy = item.target.y - source.y
      const along = dx * Math.cos(angle) + dy * Math.sin(angle)
      const across = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle))
      if (along > 0 && along < range && across < 27 && (!best || along < best.along)) best = {item, along}
    })
    if (best) this.hitTarget(best.item, damage, owner)
    this.addEffect({kind: "beam", x: source.x, y: source.y, toX: source.x + Math.cos(angle) * range, toY: source.y + Math.sin(angle) * range, color: "#65f6ff", life: .2})
  }

  ability = slot => {
    const player = this.state.players["demo-player"]
    if (!player || player.dead || this.cooldowns[slot] > 0) return
    const hero = String(player.hero || "blaze").toLowerCase()
    const movementSuper=["viper","titan","nova","rex","pixel","boulder"].includes(hero)
    if(player.grounded>0&&(slot==="secondary"||movementSuper))return
    if (slot === "primary" && (player.superCharge || 0) < 100) return
    if(slot==="primary"){
      player.superCharge = 0
      if(hero==="blaze"){this.pullConeTargets("demo-player",player.x,player.y,player.rotation,390,.78,80);for(let i=-3;i<=3;i+=1)this.spawnBullet("demo-player",player.rotation+i*.09,"#ff79e5",360,{kind:"overcharge",speed:720,acceleration:380,size:7,life:.85,pierce:1});this.destroyTilesInRadius(player.x+Math.cos(player.rotation)*190,player.y+Math.sin(player.rotation)*190,95,"demo-player");this.cooldowns.primary=5.2}
      else if(hero==="frost"){player.channel=2;player.haste=2.4;this.cooldowns.primary=5}
      else if(hero==="viper"){this.tryMove(player,Math.cos(player.rotation)*180,Math.sin(player.rotation)*180);this.areaDamage(player,210,1200);this.state.delayedEffects=[...(this.state.delayedEffects||[]),{time:1.5,owner:"demo-player",kind:"collapse",x:player.x,y:player.y}];this.cooldowns.primary=5.8}
      else if(hero==="titan"){player.stealth=3.2;player.dodges=2;player.haste=3.2;this.cooldowns.primary=6}
      else if(hero==="shadow"){player.vine=4;this.cooldowns.primary=5.6}
      else if(hero==="spark"){player.vortex=4;player.haste=4;this.cooldowns.primary=5}
      else if(hero==="nova"){player.airborne=2.4;player.bulletTime=2.4;for(let i=-1;i<=1;i+=1)this.spawnBullet("demo-player",player.rotation+i*.055,"#70eaff",700,{kind:"sniper",speed:1100,size:5,life:1.4,pierce:1,scaling:true,splash:90});this.cooldowns.primary=6.2}
      else if(hero==="rex"){this.tryMove(player,Math.cos(player.rotation)*230,Math.sin(player.rotation)*230,{vault:true});this.areaDamage(player,145,1400);this.enemyTargets("demo-player").forEach(({target})=>{if(Math.hypot(target.x-player.x,target.y-player.y)<145)target.stun=1.2});this.destroyTilesInRadius(player.x,player.y,175,"demo-player");this.cooldowns.primary=5.2}
      else if(hero==="pixel"){this.tryMove(player,Math.cos(player.rotation)*220,Math.sin(player.rotation)*220,{vault:true});player.invulnerable=.65;player.evolution=Math.min(4,(player.evolution||0)+1);player.ammo=1;this.radialAttack("demo-player",130,650,"thruster","#65efff");this.cooldowns.primary=5.2}
      else{player.flying=2.8;player.haste=2.8;this.cooldowns.primary=5.7}
      this.impact(15,.035)
    }else{
      const shields={viper:2.2}; const hastes={frost:2.2,spark:1.4,boulder:1.8}
      player.shield=shields[hero]||0;player.haste=hastes[hero]||0
      if(hero==="blaze"){const clone={x:player.x,y:player.y};this.tryMove(player,Math.cos(player.rotation)*175,Math.sin(player.rotation)*175);player.dashResetWindow=3;this.addEffect({kind:"clone",x:clone.x,y:clone.y,radius:80,color:"#d38cff",life:1.4})}
      if(hero==="shadow"){this.tryMove(player,Math.cos(player.rotation)*170,Math.sin(player.rotation)*170);this.radialAttack("demo-player",90,650,"spore-jump","#75d947")}
      if(hero==="nova"){const wall=this.closestWallPoint(player,player.rotation,330);if(wall){player.x=wall.x;player.y=wall.y}else this.tryMove(player,Math.cos(player.rotation)*240,Math.sin(player.rotation)*240);player.ammo=3;this.addEffect({kind:"grapple",x:player.x,y:player.y,toX:wall?.x??player.x,toY:wall?.y??player.y,color:"#8ff4ff",life:.35})}
      if(hero==="rex")this.tryMove(player,Math.cos(player.rotation)*165,Math.sin(player.rotation)*165)
      if(hero==="pixel"){this.tryMove(player,Math.cos(player.rotation)*150,Math.sin(player.rotation)*150);this.radialAttack("demo-player",90,600,"overload","#65efff")}
      this.cooldowns.secondary=hero==="blaze"?4.5:6.5
    }
  }

  spawnPoison(source) {
    this.state.effects ??= []
    this.state.effects.push({x: source.x, y: source.y, radius: 120, life: .45, color: "#70e34f"})
    Object.values(this.state.players).forEach(target => {
      if (target !== source && Math.hypot(target.x - source.x, target.y - source.y) < 120) target.lives = Math.max(0, target.lives - 700)
    })
  }

  chainLightning(source) {
    Object.values(this.state.players).filter(target => target !== source && !target.dead)
      .sort((a, b) => Math.hypot(a.x - source.x, a.y - source.y) - Math.hypot(b.x - source.x, b.y - source.y))
      .slice(0, 3).forEach((target, index) => {
        target.lives = Math.max(0, target.lives - 700)
        this.state.effects ??= []
        this.state.effects.push({x: target.x, y: target.y, radius: 70 + index * 15, life: .45, color: "#56e7ff"})
      })
  }

  areaDamage(source, radius, damage) {
    Object.entries(this.state.players).forEach(([id, target]) => {
      if (id === "demo-player" || target.dead) return
      if (Math.hypot(target.x - source.x, target.y - source.y) <= radius) {
        target.lives = Math.max(0, target.lives - damage)
        if (!target.lives) target.dead = true
      }
    })
    this.state.effects ??= []
    this.state.effects.push({x: source.x, y: source.y, radius, life: .45, color: source.color})
    this.destroyTilesInRadius(source.x, source.y, radius)
  }

  destroyTilesInRadius(worldX, worldY, radius, owner = null) {
    const map = this.state.map
    if (typeof map.destroyTile !== "function") return
    const size = map.tileSize || 40
    let destroyed=0
    for (let y = Math.floor((worldY - radius) / size); y <= Math.floor((worldY + radius) / size); y += 1) {
      for (let x = Math.floor((worldX - radius) / size); x <= Math.floor((worldX + radius) / size); x += 1) {
        const cx = (x + .5) * size, cy = (y + .5) * size
        if (Math.hypot(cx - worldX, cy - worldY) <= radius + size * .7 && map.destroyTile(x, y)) {
          destroyed+=1
          for (let i = 0; i < 5; i += 1) this.addEffect({kind: "debris", x: cx + (Math.random() - .5) * size, y: cy + (Math.random() - .5) * size, radius: 18 + Math.random() * 24, color: i < 3 ? "#b56b35" : "#d9c1a0", life: .35 + Math.random() * .35})
        }
      }
    }
    if(destroyed&&String(this.state.players[owner]?.hero||"").toLowerCase()==="blaze")this.cooldowns.secondary=0
    return destroyed
  }

  wallAhead(source,angle,distance){const x=source.x+Math.cos(angle)*distance,y=source.y+Math.sin(angle)*distance;return this.state.map.walls.some(w=>blocksMovement(w)&&circleHitsRect(x,y,source.radius||14,w))}

  closestWallPoint(source,angle,maxDistance){let best=null;this.state.map.walls.forEach(w=>{if(!blocksMovement(w))return;const x=clamp(source.x+Math.cos(angle)*maxDistance,w.minX,w.maxX),y=clamp(source.y+Math.sin(angle)*maxDistance,w.minY,w.maxY),d=Math.hypot(x-source.x,y-source.y);if(d<=maxDistance&&(!best||d<best.d))best={x:source.x+(x-source.x)/Math.max(1,d)*Math.max(0,d-(source.radius||14)-4),y:source.y+(y-source.y)/Math.max(1,d)*Math.max(0,d-(source.radius||14)-4),d}});return best}

  createRockCover(x,y,owner){const size=38,id=`rock-${performance.now()}-${Math.random()}`;const wall={id,type:"temporary-rock",minX:x-size/2,minY:y-size/2,maxX:x+size/2,maxY:y+size/2,temporary:true,expiresAt:(this.state.game.elapsed||0)+3.5,owner};this.state.map.walls.push(wall);this.addEffect({kind:"rock",x,y,radius:58,color:"#b87447",life:.45})}

  spawnBullet(owner, angle, color, damage = 1, options = {}) {
    const source = this.state.players[owner]
    if (!source) return
    this.state.bullets.push({
      id: `${owner}-${performance.now()}-${Math.random()}`,
      playerId: owner,
      x: source.x + Math.cos(angle) * 34,
      y: source.y + Math.sin(angle) * 34,
      rotation: angle,
      color,
      damage,
      kind: options.kind || "bolt",
      speed: options.speed || 510,
      size: options.size || 7,
      pierce: options.pierce || 0,
      splash: options.splash || 0,
      hitIds: [],
      life: options.life || 1.35,
      maxLife: options.life || 1.35,
      poison: options.poison || 0,
      scaling: Boolean(options.scaling),
      acceleration: options.acceleration || 0,
      ignite: Boolean(options.ignite),
      chain: options.chain || 0,
      bounces: options.bounces || 0,
    })
  }

  tick = now => {
    if (!this.running) return
    let dt = Math.min((now - this.lastAt) / 1000, .034)
    this.lastAt = now
    if(this.hitstop>0){this.hitstop=Math.max(0,this.hitstop-dt);this.onUpdate(this.state,false);this.frame=requestAnimationFrame(this.tick);return}
    this.updatePlayer(dt)
    const worldDt=this.state.players["demo-player"]?.bulletTime>0?dt*.6:dt
    this.updateBots(worldDt, now)
    this.updateMonsters(worldDt, now)
    this.updateBullets(worldDt)
    this.updatePickups()
    Object.keys(this.cooldowns).forEach(key => { this.cooldowns[key] = Math.max(0, this.cooldowns[key] - dt) })
    Object.values(this.state.players).forEach(target => {
      ["stun","grounded","invulnerable","dashResetWindow","channel","stealth","vortex","vine","airborne","bulletTime","flying","heatTime","blind","shieldDuration","regenBlocked","regenFx"].forEach(k=>target[k]=Math.max(0,(target[k]||0)-dt))
      if(target.shieldDuration<=0)target.shieldStacks=0
      if(String(target.hero||"").toLowerCase()==="rex"&&!target.dead)target.superCharge=Math.min(100,(target.superCharge||0)+dt*7)
      if(target.heatTime<=0)target.heat=Math.max(0,(target.heat||0)-dt*2)
      if((target.poisonTime||0)>0&&!target.dead){target.poisonTime=Math.max(0,target.poisonTime-dt);target.poisonTick=(target.poisonTick||0)-dt;if(target.poisonTick<=0){target.poisonTick=.5;target.regenBlocked=3;target.lives=Math.max(0,target.lives-(target.poisonDamage||150));this.addEffect({kind:"damage",x:target.x,y:target.y,damage:target.poisonDamage||150,color:"#8dff61",life:.55});Object.values(this.state.players).forEach(adjacent=>{if(adjacent!==target&&!adjacent.dead&&Math.hypot(adjacent.x-target.x,adjacent.y-target.y)<135){adjacent.poisonTime=4;adjacent.poisonDamage=target.poisonDamage;adjacent.poisonTick=Math.min(adjacent.poisonTick||.5,.5)}});if(!target.lives)target.dead=true}}
    })
    this.updateRegeneration(dt)
    const local = this.state.players["demo-player"]
    if (local) {
      local.cooldowns = {...this.cooldowns}
      local.shield = Math.max(0, (local.shield || 0) - dt)
      local.haste = Math.max(0, (local.haste || 0) - dt)
      if(local.channel>0)this.beamAttack("demo-player",local.rotation,840,150*dt*60)
      if(local.vine>0){this.pullTargets("demo-player",local.x,local.y,260,32*dt,1);if(Math.floor(local.vine*2)!==Math.floor((local.vine+dt)*2))this.radialAttack("demo-player",245,180,"vine","#75d947")}
      if(local.vortex>0){this.radialAttack("demo-player",125,120*dt*60,"vortex","#9f73ff");local.lives=Math.min(local.maxLives,local.lives+60*dt)}
      if(local.flying>0&&Math.floor(local.flying*4)!==Math.floor((local.flying+dt)*4)){this.addEffect({kind:"acid",x:local.x,y:local.y,radius:110,color:"#5f2a72",life:2.2});this.enemyTargets("demo-player").forEach(({target})=>{if(Math.hypot(target.x-local.x,target.y-local.y)<110)target.blind=1.2})}
    }
    this.state.map.walls=this.state.map.walls.filter(w=>!w.temporary||(w.expiresAt||0)>this.state.game.elapsed)
    this.state.delayedEffects=(this.state.delayedEffects||[]).map(e=>({...e,time:e.time-dt})).filter(e=>{if(e.time>0)return true;this.pullTargets(e.owner,e.x,e.y,260,150);this.radialAttack(e.owner,150,650,"collapse","#ff7138",e.x,e.y);this.enemyTargets(e.owner).forEach(({target})=>{if(Math.hypot(target.x-e.x,target.y-e.y)<180)target.stun=.35});return false})
    this.state.effects = (this.state.effects || []).map(effect => ({...effect, life: effect.life - dt})).filter(effect => effect.life > 0)
    this.state.game.elapsed = (this.state.game.elapsed || 0) + dt
    this.checkBattleResult()
    this.onUpdate(this.state, now - this.lastUiAt > 90)
    if (now - this.lastUiAt > 90) this.lastUiAt = now
    this.frame = requestAnimationFrame(this.tick)
  }

  updatePlayer(dt) {
    const player = this.state.players["demo-player"]
    if (!player || player.dead) return
    if(player.stun>0)return
    const speedBoost = (player.haste > 0 ? 1.55 : 1) * ((player.heat||0)>=5?1.4:1)
    const baseSpeed = player.moveSpeed || 235
    this.tryMove(player, this.moveVector.x * baseSpeed * speedBoost * dt, this.moveVector.y * baseSpeed * speedBoost * dt)
  }

  updateRegeneration(dt) {
    Object.entries(this.state.players).forEach(([id, target])=>{
      if(target.dead||target.lives<=0||target.lives>=target.maxLives||(target.regenBlocked||0)>0)return
      const baseRate=target.regenRate||.01
      const rate=baseRate*(this.isConcealedInBush(id,target)?2:1)
      target.regenCarry=(target.regenCarry||0)+target.maxLives*rate*dt
      const healed=Math.min(target.maxLives-target.lives,Math.floor(target.regenCarry))
      if(healed<=0)return
      target.lives+=healed;target.regenCarry-=healed;target.regenDisplay=(target.regenDisplay||0)+healed
      if((target.regenFx||0)<=0&&target.regenDisplay>=target.maxLives*rate*.75){this.addEffect({kind:"heal",x:target.x,y:target.y,damage:target.regenDisplay,color:"#73ff8f",life:.62});target.regenDisplay=0;target.regenFx=.75}
    })
  }

  isConcealedInBush(id,target) {
    const bush=this.state.map.walls.find(w=>(w.type==="bush"||w.type==="half")&&target.x>=w.minX&&target.x<=w.maxX&&target.y>=w.minY&&target.y<=w.maxY)
    if(!bush)return false
    return Object.entries(this.state.players).every(([otherId,other])=>{
      if(otherId===id||other.dead||(target.team&&target.team===other.team))return true
      const otherBush=this.state.map.walls.find(w=>(w.type==="bush"||w.type==="half")&&other.x>=w.minX&&other.x<=w.maxX&&other.y>=w.minY&&other.y<=w.maxY)
      const sharesBush=otherBush&&(otherBush===bush||(otherBush.bushGroup!==undefined&&otherBush.bushGroup===bush.bushGroup))
      return !sharesBush&&Math.hypot(other.x-target.x,other.y-target.y)>Math.max(90,(this.state.map.tileSize||40)*2.5)
    })
  }

  updateBots(dt, now) {
    Object.entries(this.state.players).forEach(([id, bot]) => {
      if (id === "demo-player" || bot.dead) return
      if (!this.botAIs.has(id)) this.botAIs.set(id, new BotAI(id, {now}))
      const bushes = this.state.map.walls.filter(wall => wall.type === "bush" || wall.type === "half")
        .map(wall => ({x: (wall.minX + wall.maxX) / 2, y: (wall.minY + wall.maxY) / 2}))
      const crates = this.state.map.walls.filter(wall => wall.type === "crates")
        .map(wall => ({...wall, x: (wall.minX + wall.maxX) / 2, y: (wall.minY + wall.maxY) / 2}))
      const command = this.botAIs.get(id).update({...this.state, bushes, crates}, now)
      bot.aiState = this.botAIs.get(id).state
      bot.rotation = command.aim
      bot.slow = Math.max(0, (bot.slow || 0) - dt)
      const speed = (bot.moveSpeed || 220) * 1.12 * (bot.slow > 0 ? .45 : 1) * (bot.stun>0?0:1)
      this.tryMove(bot, command.move.x * speed * dt, command.move.y * speed * dt)
      if (command.attack) this.performAttack(id, command.aim, now)
      if (command.useSuper) this.performBotSuper(id, command.aim)
    })
    for (const id of this.botAIs.keys()) if (!this.state.players[id]) this.botAIs.delete(id)
    const player = this.state.players["demo-player"]
    if (player?.dead) player.rotation += dt
  }

  performBotSuper(id, angle) {
    const bot = this.state.players[id]
    if (!bot || (bot.superCharge || 0) < 100) return
    bot.superCharge = 0
    const melee = ["frost", "viper", "titan", "rex"].includes(String(bot.hero || "").toLowerCase())
    if (melee) {
      this.tryMove(bot, Math.cos(angle) * 145, Math.sin(angle) * 145)
      this.radialAttack(id, 165, 900, "super", bot.color)
    } else {
      for (let offset = -2; offset <= 2; offset += 1) this.spawnBullet(id, angle + offset * .1, bot.color, 420, {speed: 680, life: 1.2})
    }
  }

  updateMonsters(dt, now) {
    Object.entries(this.state.monsters || {}).forEach(([id, monster], index) => {
      if (monster.lives <= 0) {
        delete this.state.monsters[id]
        return
      }
      let target = null
      let closest = Infinity
      Object.values(this.state.players).forEach(player => {
        if (player.dead) return
        const distance = Math.hypot(player.x - monster.x, player.y - monster.y)
        if (distance < closest) { closest = distance; target = player }
      })
      if (!target) return
      const angle = Math.atan2(target.y - monster.y, target.x - monster.x)
      monster.rotation = angle
      if (closest < 430) {
        const pace = closest < 50 ? 0 : 105 + (monster.tier || 1) * 15 + index * 2
        this.tryMove(monster, Math.cos(angle) * pace * dt, Math.sin(angle) * pace * dt)
      } else {
        const patrolAngle = this.state.game.elapsed * .35 + index * 1.9
        this.tryMove(monster, Math.cos(patrolAngle) * 28 * dt, Math.sin(patrolAngle) * 28 * dt)
      }
      if (closest < 56 && now - (monster.attackAt || 0) > (monster.tier === 2 ? 900 : 1100)) {
        monster.attackAt = now
        const damage = target.shield > 0 ? 128 : 620 + (monster.tier || 1) * 180
        target.lives = Math.max(0, target.lives - damage)
        target.regenBlocked=3
        this.addEffect({kind:"damage",x:target.x,y:target.y,damage,color:"#ff705c",life:.72})
        if (!target.lives) target.dead = true
      }
    })
  }

  tryMove(entity, dx, dy, options = {}) {
    // Match the server-side hero bodies. A 24px radius made a 40px-wide
    // one-tile corridor physically impossible despite looking walkable.
    const hero = String(entity.hero || "").toLowerCase()
    const radius = Number(entity.radius) || HERO_MOVE_RADII[hero] || 14
    // Sweep long dashes in short segments, otherwise a hero can tunnel through a wall.
    const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/(radius*.45))),stepX=dx/steps,stepY=dy/steps
    for(let step=0;step<steps;step+=1){
      const nextX=clamp(entity.x+stepX,radius,this.state.map.width-radius),nextY=clamp(entity.y+stepY,radius,this.state.map.height-radius)
      const xBlocked=!options.vault&&this.state.map.walls.some(wall=>blocksMovement(wall)&&circleHitsRect(nextX,entity.y,radius,wall))
      const yBlocked=!options.vault&&this.state.map.walls.some(wall=>blocksMovement(wall)&&circleHitsRect(entity.x,nextY,radius,wall))
      if(!xBlocked)entity.x=nextX
      if(!yBlocked)entity.y=nextY
      if(xBlocked&&yBlocked)break
    }
  }

  updateBullets(dt) {
    this.state.bullets.forEach(bullet => {
      const previousX = bullet.x, previousY = bullet.y
      bullet.speed=(bullet.speed||510)+(bullet.acceleration||0)*dt
      bullet.x += Math.cos(bullet.rotation) * bullet.speed * dt
      bullet.y += Math.sin(bullet.rotation) * (bullet.speed || 510) * dt
      bullet.life -= dt
      const wallHit = this.state.map.walls.some(wall => wall.type !== "bush" && wall.type !== "half" &&
        segmentHitsRect(previousX, previousY, bullet.x, bullet.y, bullet.size || 7, wall))
      if (wallHit&&bullet.bounces>0){bullet.bounces-=1;bullet.rotation+=Math.PI*(.82+(Math.random()-.5)*.25);bullet.x=previousX;bullet.y=previousY}else if(wallHit)bullet.life=0
      Object.entries(this.state.players).forEach(([id, target]) => {
        if (id === bullet.playerId || target.dead || bullet.life <= 0 || bullet.hitIds?.includes(id)) return
        if (segmentHitsCircle(previousX, previousY, bullet.x, bullet.y, target.x, target.y, (target.radius||14) + (bullet.size || 7))) {
          if(target.invulnerable>0)return
          if((target.deflect||0)>0){target.deflect=0;bullet.playerId=id;bullet.rotation+=Math.PI;bullet.hitIds=[];bullet.x=previousX;bullet.y=previousY;this.addEffect({kind:"spin",x:target.x,y:target.y,radius:90,color:"#e8ffb2",life:.35});return}
          if(target.stealth>0&&(target.dodges||0)>0){target.dodges-=1;this.radialAttack(id,105,520,"spin","#d9fff7");bullet.life=0;return}
          const travelScale=bullet.scaling?1+(1-bullet.life/(bullet.maxLife||1))*.75:1
          const rawDamage=Math.round(bullet.damage*travelScale*(this.state.players[bullet.playerId]?.damageMultiplier||1))
          const appliedDamage = Math.round(rawDamage*(target.shield>0?.6:1)*(1-Math.min(.75,(target.shieldStacks||0)*.15)))
          target.lives = Math.max(0, target.lives - appliedDamage)
          target.regenBlocked=3
          target.hitFlash = .18
          this.addEffect({kind:"damage",x:target.x,y:target.y,damage:appliedDamage,color:"#fff",life:.72})
          const attacker=this.state.players[bullet.playerId]
          this.registerHit(attacker,target,bullet.playerId,id)
          if(bullet.poison){target.poisonTime=4;target.poisonDamage=Math.round(bullet.poison/8);target.poisonTick=.5}
          bullet.hitIds?.push(id)
          if (bullet.splash) this.radialAttack(bullet.playerId, bullet.splash, bullet.damage, "blast", bullet.color, bullet.x, bullet.y)
          if(bullet.chain)this.chainPrimary(bullet.playerId,190,Math.min(4,bullet.chain))
          if (bullet.pierce > 0) bullet.pierce -= 1
          else bullet.life = 0
          if (!target.lives) target.dead = true
        }
      })
      Object.entries(this.state.monsters || {}).forEach(([id, monster]) => {
        if (bullet.life <= 0 || monster.lives <= 0) return
        if (segmentHitsCircle(previousX, previousY, bullet.x, bullet.y, monster.x, monster.y, 22 + (bullet.size || 7))) {
          const monsterDamage=Math.round(bullet.damage*(this.state.players[bullet.playerId]?.damageMultiplier||1))
          monster.lives = Math.max(0, monster.lives - monsterDamage)
          monster.hitFlash=.18
          this.addEffect({kind:"damage",x:monster.x,y:monster.y,damage:monsterDamage,color:"#ffe55c",life:.72})
          const attacker=this.state.players[bullet.playerId]
          if(attacker)attacker.superCharge=Math.min(100,(attacker.superCharge||0)+20)
          if (bullet.splash) this.radialAttack(bullet.playerId, bullet.splash, bullet.damage, "blast", bullet.color, bullet.x, bullet.y)
          if (bullet.pierce > 0) bullet.pierce -= 1
          else bullet.life = 0
          if (!monster.lives) this.defeatMonster(id, monster, bullet.playerId)
        }
      })
    })
    this.state.bullets = this.state.bullets.filter(bullet => bullet.life > 0 && bullet.x > 0 && bullet.y > 0 && bullet.x < this.state.map.width && bullet.y < this.state.map.height)
    Object.keys(this.state.players).forEach(id => {
      if (this.state.players[id].dead && id !== "demo-player") delete this.state.players[id]
    })
  }

  updatePickups() {
    const player = this.state.players["demo-player"]
    if (!player) return
    this.state.props = this.state.props.filter(prop => {
      if (Math.hypot(player.x - prop.x, player.y - prop.y) > 42) return true
      if (prop.type === "power") {
        player.powerCores = (player.powerCores || 0) + 1
        player.maxLives += 350
        player.lives = Math.min(player.maxLives, player.lives + 900)
        player.damageMultiplier = Math.min(1.35, 1 + player.powerCores * .07)
        player.moveSpeed = Math.min(player.moveSpeed * 1.025, 310)
      } else {const healed=Math.min(800,player.maxLives-player.lives);player.lives=Math.min(player.maxLives, player.lives + 800);if(healed>0)this.addEffect({kind:"heal",x:player.x,y:player.y,damage:healed,color:"#73ff8f",life:.72})}
      return false
    })
  }

  defeatMonster(id, monster, owner) {
    if (!this.state.monsters[id]) return
    delete this.state.monsters[id]
    this.state.props.push({x:monster.x,y:monster.y,type:"power"})
    if (owner === "demo-player") this.stats.monsters += 1
    this.addEffect({kind:"blast",x:monster.x,y:monster.y,radius:90,color:"#ffe24d",life:.55})
  }

  checkBattleResult() {
    if (this.state.game.result) return
    const local = this.state.players["demo-player"]
    const alive = Object.entries(this.state.players).filter(([, player]) => !player.dead)
    if (local?.dead) this.state.game.result = {won:false,place:alive.length+1,kills:this.stats.kills,monsters:this.stats.monsters,duration:this.state.game.elapsed}
    else if (local && alive.length === 1) this.state.game.result = {won:true,place:1,kills:this.stats.kills,monsters:this.stats.monsters,duration:this.state.game.elapsed}
  }
}
