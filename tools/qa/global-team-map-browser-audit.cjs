const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const {chromium} = require("playwright")
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.MAP_QA_URL || "http://localhost"
const output = path.resolve(__dirname, "../../output/playwright/abandoned-city-map/global-audit")

const sectors = [
  ["north-west", .25, .25], ["north", .5, .16], ["north-east", .75, .25],
  ["west", .16, .5], ["center", .5, .5], ["east", .84, .5],
  ["south-west", .25, .75], ["south", .5, .84], ["south-east", .75, .75],
]
const baseViews = [
  ["base-blue", 16.5, 63.5],
  ["base-red", 63.5, 16.5],
]
const cityViews = [
  ["city-depot-detail", 13, 52],
  ["city-market-detail", 30, 47],
  ["city-apartments-detail", 44, 60],
  ["city-north-gate-detail", 16, 31],
  ["city-south-ward-detail", 49, 64],
]

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    fs.mkdirSync(output, {recursive: true})
    const page = await browser.newPage({viewport: {width: 1600, height: 1000}, deviceScaleFactor: 1})
    const consoleErrors = []
    const pageErrors = []
    page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()) })
    page.on("pageerror", error => pageErrors.push(error.stack || String(error)))

    await page.goto(`${baseUrl}/test/map-environment-harness.html?mode=team`, {waitUntil: "domcontentloaded", timeout: 30_000})
    await page.waitForFunction(() => document.querySelector("#status")?.classList.contains("is-ready"), {timeout: 30_000})
    await page.evaluate(() => document.querySelector("#toggle-panel")?.click())
    await page.evaluate(() => {
      window.qa.battleRenderer.cameraRig.preferredVertical = 34
      window.qa.battleRenderer.render()
    })

    const metrics = await page.evaluate(() => {
      const map = window.qa.map
      const tile = map.tileSize || 40
      const width = Math.round(map.width / tile)
      const height = Math.round(map.height / tile)
      const key = (x, y) => `${x}:${y}`
      const cellOf = wall => [Math.floor(wall.minX / tile), Math.floor(wall.minY / tile)]
      const wallTypes = new Map()
      const occupied = new Map()
      const duplicateCells = new Set()
      for (const wall of map.walls) {
        const [x, y] = cellOf(wall)
        const cellKey = key(x, y)
        if (occupied.has(cellKey)) duplicateCells.add(cellKey)
        occupied.set(cellKey, wall)
        wallTypes.set(wall.type, (wallTypes.get(wall.type) || 0) + 1)
      }
      const blockingTypes = new Set(["water", "river", "wall", "destructible", "tree", "dead_tree", "menhir", "crates", "ruin_wall", "thorn_vine", "building_wall", "building_rubble", "fortress_wall", "shipwreck", "pond", "rock"])
      const isBlocking = wall => typeof wall?.blocking === "boolean" ? wall.blocking : blockingTypes.has(wall?.type)
      const blocked = new Set([...occupied].filter(([, wall]) => isBlocking(wall)).map(([cell]) => cell))
      const inBounds = (x, y) => x >= 0 && y >= 0 && x < width && y < height
      const neighbors = (x, y) => [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].filter(([nx, ny]) => inBounds(nx, ny))
      const cellFromPoint = point => [Math.floor(Number(point.x) / tile), Math.floor(Number(point.y) / tile)]
      const spawners = Object.fromEntries(Object.entries(map.teamSpawns || {}).map(([team, points]) => [team, points.map(cellFromPoint)]))
      const reachableFrom = starts => {
        const seen = new Set()
        const queue = starts.filter(([x, y]) => inBounds(x, y) && !blocked.has(key(x, y)))
        for (const [x, y] of queue) seen.add(key(x, y))
        for (let index = 0; index < queue.length; index += 1) {
          const [x, y] = queue[index]
          for (const [nx, ny] of neighbors(x, y)) {
            const next = key(nx, ny)
            if (!blocked.has(next) && !seen.has(next)) { seen.add(next); queue.push([nx, ny]) }
          }
        }
        return seen
      }
      const reachability = Object.fromEntries(Object.entries(spawners).map(([team, starts]) => {
        const reachable = reachableFrom(starts)
        return [team, {startCells: starts, reachableCells: reachable.size, reachesOpposingHalf: [...reachable].some(cell => {
          const [x, y] = cell.split(":").map(Number)
          return team.toLowerCase().includes("blue") ? x + y > width * 1.25 : x + y < width * .75
        })}]
      }))
      const bridgeCells = [...occupied].filter(([, wall]) => wall.type === "river_bridge").map(([cell]) => cell)
      const featureSummary = map.features.reduce((summary, feature) => {
        summary[feature.type] = (summary[feature.type] || 0) + 1
        return summary
      }, {})
      const cityFeatures = map.features.filter(feature => feature.type.startsWith("city_"))
      const baseFeatures = map.features.filter(feature => feature.type.startsWith("base_"))
      const cityNearBridge = cityFeatures.map(feature => {
        const [x, y] = cellFromPoint(feature)
        const distance = Math.min(...map.features.filter(candidate => candidate.type === "river_bridge").map(candidate => {
          const [bx, by] = cellFromPoint(candidate)
          return Math.hypot(x - bx, y - by)
        }))
        return {id: feature.id, type: feature.type, cell: [x, y], nearestBridgeCells: Number(distance.toFixed(1))}
      })
      return {
        map: {id: map.id, width: map.width, height: map.height, tile, wallCount: map.walls.length},
        wallTypes: Object.fromEntries(wallTypes),
        duplicateCollisionCells: [...duplicateCells],
        bridgeCells: bridgeCells.length,
        spawners,
        reachability,
        featureSummary,
        cityNearBridge,
        cityFeatures: cityFeatures.length,
        baseFeatures: baseFeatures.length,
        baseFeatureSummary: baseFeatures.reduce((summary, feature) => {
          summary[feature.type] = (summary[feature.type] || 0) + 1
          return summary
        }, {}),
        objectives: map.objectives.length,
      }
    })

    assert.equal(metrics.map.id, "team-battle@20260816")
    assert.equal(metrics.duplicateCollisionCells.length, 0, `duplicate collision cells: ${metrics.duplicateCollisionCells.join(", ")}`)
    assert.equal(metrics.bridgeCells > 0, true)
    assert.equal(metrics.cityFeatures >= 11, true)
    assert.equal(metrics.baseFeatures, 6)
    assert.deepEqual(metrics.baseFeatureSummary, {base_well: 2, base_workshop: 2, base_wagon: 2})
    assert.deepEqual(consoleErrors, [])
    assert.deepEqual(pageErrors, [])

    for (const [name, x, y] of sectors) {
      await page.evaluate(({x, y, name}) => {
        const map = window.qa.map
        const tile = map.tileSize || 40
        const target = [Math.floor(map.width * x / tile), Math.floor(map.height * y / tile)]
        const blockingTypes = new Set(["water", "river", "wall", "destructible", "tree", "dead_tree", "menhir", "crates", "ruin_wall", "thorn_vine", "building_wall", "building_rubble", "fortress_wall", "shipwreck", "pond", "rock"])
        const blocked = new Set(map.walls.filter(wall => typeof wall.blocking === "boolean" ? wall.blocking : blockingTypes.has(wall.type)).map(wall => `${Math.floor(wall.minX / tile)}:${Math.floor(wall.minY / tile)}`))
        let candidate = target
        for (let radius = 0; radius <= 8; radius += 1) {
          const options = []
          for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
            const cell = [target[0] + dx, target[1] + dy]
            if (cell[0] < 1 || cell[1] < 1 || cell[0] >= map.width / tile - 1 || cell[1] >= map.height / tile - 1) continue
            if (!blocked.has(`${cell[0]}:${cell[1]}`)) options.push(cell)
          }
          if (options.length) { candidate = options[0]; break }
        }
        window.qa.updatePosition((candidate[0] + .5) * tile, (candidate[1] + .5) * tile, name)
      }, {x, y, name})
      await page.waitForTimeout(180)
      await page.screenshot({path: path.join(output, `${name}.png`), fullPage: true})
    }
    await page.evaluate(() => { window.qa.battleRenderer.cameraRig.preferredVertical = 55; window.qa.battleRenderer.render() })
    await page.waitForTimeout(180)
    await page.screenshot({path: path.join(output, "overview.png"), fullPage: true})

    await page.evaluate(() => {
      window.qa.battleRenderer.cameraRig.preferredVertical = 22
      window.qa.battleRenderer.render()
    })
    for (const [name, x, y] of baseViews) {
      await page.evaluate(({name, x, y}) => {
        const target = {x: x * 40, y: y * 40}
        window.qa.updatePosition(target.x, target.y, name)
        window.qa.battleRenderer.cameraRig.follow(target, {width: window.qa.map.width, height: window.qa.map.height}, 1)
        window.qa.battleRenderer.render()
      }, {name, x, y})
      await page.waitForTimeout(220)
      await page.screenshot({path: path.join(output, `${name}.png`), fullPage: true})
    }
    for (const [name, x, y] of cityViews) {
      await page.evaluate(({name, x, y}) => {
        const target = {x: x * 40, y: y * 40}
        window.qa.updatePosition(target.x, target.y, name)
        window.qa.battleRenderer.cameraRig.follow(target, {width: window.qa.map.width, height: window.qa.map.height}, 1)
        window.qa.battleRenderer.cameraRig.preferredVertical = 16
        window.qa.battleRenderer.render()
      }, {name, x, y})
      await page.waitForTimeout(220)
      await page.screenshot({path: path.join(output, `${name}.png`), fullPage: true})
    }

    process.stdout.write(JSON.stringify({metrics, screenshots: sectors.map(([name]) => path.join(output, `${name}.png`)).concat(path.join(output, "overview.png"), baseViews.map(([name]) => path.join(output, `${name}.png`)), cityViews.map(([name]) => path.join(output, `${name}.png`))), consoleErrors, pageErrors}, null, 2))
  },
).catch(error => {
  console.error(error)
  process.exitCode = 1
})
