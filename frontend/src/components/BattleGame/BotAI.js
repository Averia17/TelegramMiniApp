export const BotState = Object.freeze({
  SPAWN: "STATE_SPAWN",
  FARM: "STATE_FARM",
  COMBAT: "STATE_COMBAT",
  RETREAT: "STATE_RETREAT",
  CAMPING: "STATE_CAMPING",
})

export const addMatchBots = (humanPlayers, createBot, maxPlayers = 8, maxBots = 3) => {
  const humans = humanPlayers.filter(player => !player.isBot)
  if (humans.length >= Math.ceil(maxPlayers / 2)) return [...humans]
  const botCount = Math.min(maxBots, maxPlayers - humans.length)
  return [...humans, ...Array.from({length: botCount}, (_, index) => createBot(index))]
}

const length = vector => Math.hypot(vector.x, vector.y)
export const normalize = vector => {
  const magnitude = length(vector)
  return magnitude ? {x: vector.x / magnitude, y: vector.y / magnitude} : {x: 0, y: 0}
}
export const subtract = (a, b) => ({x: a.x - b.x, y: a.y - b.y})
export const distance = (a, b) => length(subtract(a, b))
export const centerOf = map => ({x: map.width / 2, y: map.height / 2})

const nearest = (origin, items) => items.reduce((best, item) => {
  const candidate = {item, distance: distance(origin, item)}
  return !best || candidate.distance < best.distance ? candidate : best
}, null)

const dot = (a, b) => a.x * b.x + a.y * b.y
const rotate = (vector, angle) => ({x: vector.x * Math.cos(angle) - vector.y * Math.sin(angle), y: vector.x * Math.sin(angle) + vector.y * Math.cos(angle)})
const blocksMovement = wall => !["bush", "half"].includes(wall.type)

export class BotAI {
  constructor(botId, options = {}) {
    this.botId = botId
    this.state = BotState.SPAWN
    this.visionRange = options.visionRange ?? 1200
    this.tickInterval = options.tickInterval ?? 250
    this.spawnUntil = (options.now ?? performance.now()) + 3000 + Math.random() * 2000
    this.lastTickAt = -Infinity
    this.lastAttackAt = -Infinity
    this.targetHistory = new Map()
    this.currentTargetId = null
    this.lastPosition = null
    this.stuckTicks = 0
    this.command = {move: {x: 0, y: 0}, aim: 0, attack: false, useSuper: false}
  }

  update(world, now = performance.now()) {
    const bot = world.players[this.botId]
    const dodge = bot && this.projectileDodge(bot, world)
    if (dodge) {
      this.command = {...this.command, move: dodge, attack: false, useSuper: false}
      return this.command
    }
    if (now - this.lastTickAt < this.tickInterval) return this.command
    this.lastTickAt = now
    const situation = this.evaluateSituation(world, now)
    this.state = situation.state
    this.command = this.decide(world, situation, now)
    this.command.move = this.navigate(bot, this.command.move, world)
    if (this.command.attack) this.lastAttackAt = now
    return this.command
  }

  evaluateSituation(world, now = performance.now()) {
    this._world = world
    const bot = world.players[this.botId]
    if (!bot) return {state: BotState.CAMPING}
    const enemies = Object.entries(world.players)
      .filter(([id, player]) => id !== this.botId && !player.dead && (!bot.team || !player.team || bot.team !== player.team))
      .map(([id, player]) => ({...player, id}))
    const enemy = this.selectTarget(bot, enemies)
    const crate = nearest(bot, (world.crates || []).filter(item => !item.destroyed))
    const bush = nearest(bot, world.bushes || [])
    const aliveCount = Object.values(world.players).filter(player => !player.dead).length
    const smokeDanger = this.smokeIsClose(bot, world)

    if (smokeDanger) return {state: BotState.RETREAT, safetyOverride: "smoke", enemy: enemy?.item}
    if (aliveCount === 2 && enemy) return {state: BotState.COMBAT, safetyOverride: "top-two", enemy: enemy.item}
    if ((bot.lives || 0) / Math.max(1, bot.maxLives || 1) < .35) return {state: BotState.RETREAT, enemy: enemy?.item, bush: bush?.item}
    if (now < this.spawnUntil) return {state: BotState.SPAWN, crate: crate?.item, bush: bush?.item}
    if (this.state === BotState.CAMPING && enemy && enemy.distance <= this.visionRange) {
      const weakerEnemy = (enemy.item.lives || 0) < (bot.lives || 0)
      return weakerEnemy ? {state: BotState.COMBAT, enemy: enemy.item, ambush: true} : {state: BotState.CAMPING, bush: bush?.item, enemy: enemy.item}
    }
    if (enemy && enemy.distance <= this.visionRange) return {state: BotState.COMBAT, enemy: enemy.item}
    if (crate && crate.distance <= this.visionRange) return {state: BotState.FARM, crate: crate.item}
    return {state: BotState.CAMPING, bush: bush?.item, enemy: enemy?.item}
  }

  selectTarget(bot, enemies) {
    let best = null
    for (const enemy of enemies) {
      const range = distance(bot, enemy)
      if (range > this.visionRange * 1.25) continue
      const healthRatio = (enemy.lives || 0) / Math.max(1, enemy.maxLives || 1)
      const score = 700 - range + (healthRatio < .3 ? 180 : 0) +
        (enemy.targetId === this.botId ? 120 : 0) + (this.hasLineOfSight(bot, enemy) ? 80 : -100) +
        (enemy.id === this.currentTargetId ? 110 : 0)
      if (!best || score > best.score) best = {item: enemy, distance: range, score}
    }
    if (best) this.currentTargetId = best.item.id
    return best
  }

  decide(world, situation, now) {
    const bot = world.players[this.botId]
    if (!bot) return this.command
    if (situation.safetyOverride === "smoke") return this.moveTo(bot, centerOf(world.map))
    if (situation.state === BotState.RETREAT) {
      if (situation.enemy) return this.moveAway(bot, situation.enemy)
      return situation.bush ? this.moveTo(bot, situation.bush) : this.moveTo(bot, centerOf(world.map))
    }
    if (situation.state === BotState.CAMPING) {
      if (!situation.bush || distance(bot, situation.bush) < 20) return {...this.command, move: {x: 0, y: 0}, attack: false, useSuper: false}
      return this.moveTo(bot, situation.bush)
    }
    if (situation.state === BotState.SPAWN || situation.state === BotState.FARM) {
      if (!situation.crate) return situation.bush ? this.moveTo(bot, situation.bush) : this.moveTo(bot, centerOf(world.map))
      return this.attackTarget(bot, situation.crate, world, now, true)
    }
    const combat = this.attackTarget(bot, situation.enemy, world, now, false)
    if (situation.safetyOverride === "top-two" && situation.enemy) combat.move = normalize(subtract(situation.enemy, bot))
    return combat
  }

  attackTarget(bot, target, world, now, farming) {
    if (!target) return {...this.command, move: {x: 0, y: 0}, attack: false, useSuper: false}
    const melee = ["frost", "viper", "titan", "rex"].includes(String(bot.hero || "").toLowerCase())
    const attackRange = melee ? 135 : Math.min(700, bot.attackRange || 620)
    const targetDistance = distance(bot, target)
    const predicted = farming ? target : this.predictTarget(target, world, now, bot.bulletSpeed || 510, targetDistance)
    const aim = Math.atan2(predicted.y - bot.y, predicted.x - bot.x)
    let move = {x: 0, y: 0}
    if (melee || targetDistance > attackRange * .9) move = normalize(subtract(target, bot))
    else if (targetDistance < attackRange * .65) move = normalize(subtract(bot, target))
    const inRange = targetDistance <= attackRange && (farming || this.hasLineOfSight(bot, predicted, world))
    return {move, aim, attack: inRange, useSuper: !farming && (bot.superCharge || 0) >= 100 && inRange}
  }

  projectileDodge(bot, world) {
    let threat = null
    for (const bullet of world.bullets || []) {
      if (bullet.playerId === this.botId || bullet.life <= 0) continue
      const direction = {x: Math.cos(bullet.rotation), y: Math.sin(bullet.rotation)}
      const relative = subtract(bot, bullet)
      const forward = dot(relative, direction)
      if (forward < 0 || forward > 230) continue
      const lateral = Math.abs(relative.x * -direction.y + relative.y * direction.x)
      if (lateral > 45) continue
      const time = forward / Math.max(1, bullet.speed || 510)
      if (!threat || time < threat.time) threat = {direction, time}
    }
    if (!threat) return null
    const left = {x: -threat.direction.y, y: threat.direction.x}
    const right = {x: threat.direction.y, y: -threat.direction.x}
    return this.pathIsClear(bot, left, world, 90) ? left : right
  }

  hasLineOfSight(from, to, world = this._world) {
    if (!world) return true
    const delta = subtract(to, from)
    const steps = Math.max(1, Math.ceil(length(delta) / 24))
    for (let index = 1; index < steps; index++) {
      const point = {x: from.x + delta.x * index / steps, y: from.y + delta.y * index / steps}
      if ((world.map.walls || []).some(wall => blocksMovement(wall) && point.x >= wall.minX && point.x <= wall.maxX && point.y >= wall.minY && point.y <= wall.maxY)) return false
    }
    return true
  }

  pathIsClear(origin, direction, world, lookAhead = 70) {
    const point = {x: origin.x + direction.x * lookAhead, y: origin.y + direction.y * lookAhead}
    return !(world.map.walls || []).some(wall => blocksMovement(wall) && point.x + 24 > wall.minX && point.x - 24 < wall.maxX && point.y + 24 > wall.minY && point.y - 24 < wall.maxY)
  }

  navigate(bot, desired, world) {
    if (!bot || !desired || (!desired.x && !desired.y)) return desired || {x: 0, y: 0}
    if (this.lastPosition && distance(bot, this.lastPosition) < 8) this.stuckTicks++
    else this.stuckTicks = 0
    this.lastPosition = {x: bot.x, y: bot.y}
    if (this.pathIsClear(bot, desired, world)) return desired
    const side = (this.botId.length % 2 ? 1 : -1) * (this.stuckTicks > 1 ? 1.35 : .78)
    const first = normalize(rotate(desired, side))
    return this.pathIsClear(bot, first, world) ? first : normalize(rotate(desired, -side))
  }

  predictTarget(target, world, now, bulletSpeed, targetDistance) {
    const previous = this.targetHistory.get(target.id)
    this.targetHistory.set(target.id, {x: target.x, y: target.y, at: now})
    if (!previous || now <= previous.at) return target
    const seconds = (now - previous.at) / 1000
    const velocity = {x: (target.x - previous.x) / seconds, y: (target.y - previous.y) / seconds}
    const travelTime = targetDistance / Math.max(1, bulletSpeed)
    return {x: target.x + velocity.x * travelTime, y: target.y + velocity.y * travelTime}
  }

  smokeIsClose(bot, world) {
    if (!world.smoke?.radius) return false
    const safeCenter = world.smoke.center || centerOf(world.map)
    const safeRadius = world.smoke.radius
    return safeRadius - distance(bot, safeCenter) < (world.map.tileSize || 32) * 3
  }

  moveTo(from, to) {
    return {...this.command, move: normalize(subtract(to, from)), attack: false, useSuper: false}
  }

  moveAway(from, threat) {
    return {...this.command, move: normalize(subtract(from, threat)), attack: false, useSuper: false}
  }
}
