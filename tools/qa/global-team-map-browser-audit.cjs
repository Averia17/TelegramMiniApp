const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const {chromium} = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"))
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.MAP_QA_URL || "http://127.0.0.1"
const selectedMap = process.env.MAP_QA_MAP === "team-battle" ? "team-battle" : "team-battle-northern"
const expectedMapId = selectedMap === "team-battle" ? "team-battle@20260816" : "team-battle-northern@20260827"
const expectedCityObjectBlockingCount = selectedMap === "team-battle" ? 58 : 148
const expectedBaseFeatureCount = selectedMap === "team-battle" ? 16 : 2
const expectedBaseFeatureSummary = selectedMap === "team-battle"
  ? {base_well: 2, base_workshop: 2, base_wagon: 2, base_barracks: 2, base_storehouse: 2, base_stable: 2, base_chapel: 2, base_courtyard: 2}
  : {base_compound: 2}
const output = path.resolve(__dirname, "../../output/playwright/abandoned-city-map", selectedMap, "global-audit")

const sectors = [
  ["north-west", .25, .25], ["north", .5, .16], ["north-east", .75, .25],
  ["west", .16, .5], ["center", .5, .5], ["east", .84, .5],
  ["south-west", .25, .75], ["south", .5, .84], ["south-east", .75, .75],
]
const baseViews = [
  ["base-blue", 11.5, 58.5],
  ["base-red", 58.5, 11.5],
]
const cityViews = [
  ["city-depot-detail", 8, 47],
  ["city-market-detail", 25, 42],
  ["city-apartments-detail", 39, 55],
  ["city-north-gate-detail", 11, 26],
  ["city-south-ward-detail", 44, 59],
]
const vineViews = [
  ["vine-clump-west", 10, 47],
  ["vine-clump-grove", 25, 65],
]
const detailViews = [
  ["city-street-detail", 15, 22],
  ["city-plaza-detail", 37, 43],
  ["city-watchtower-detail", 30, 39],
  ...(selectedMap === "team-battle-northern"
    ? [
        ["base-compound-overview", 11.5, 58.5],
        ["base-compound-west-wing", 7.3, 60.6],
        ["base-compound-east-wing", 15.7, 60.6],
        ["base-compound-hall", 11.5, 63.7],
      ]
    : [
        ["base-workshop-detail", 6.5, 54.5],
        ["base-well-detail", 6.5, 61],
        ["base-wagon-detail", 15.5, 64],
        ["base-barracks-detail", 8, 52.5],
        ["base-storehouse-detail", 16, 60],
        ["base-stable-detail", 18, 58],
        ["base-chapel-detail", 11, 64],
        ["base-courtyard-detail", 11.5, 58.5],
      ]),
]
const castleViews = selectedMap === "team-battle-northern"
  ? [
      ["castle-keep-detail", 25, 42], ["castle-gate-detail", 25, 47], ["castle-courtyard-detail", 25, 44],
      ["castle-ward-house-detail", 18, 36], ["castle-ward-market-detail", 25, 35],
      ["castle-ward-street-detail", 25, 48], ["castle-ward-bastion-detail", 15, 33],
      ["castle-ward-gate-detail", 25, 51],
    ]
  : []

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    fs.mkdirSync(output, {recursive: true})
    const page = await browser.newPage({viewport: {width: 1600, height: 1000}, deviceScaleFactor: 1})
    const consoleErrors = []
    const pageErrors = []
    page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()) })
    page.on("pageerror", error => pageErrors.push(error.stack || String(error)))

    await page.goto(`${baseUrl}/test/map-environment-harness.html?mode=team&map=${selectedMap}`, {waitUntil: "commit", timeout: 30_000})
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
        // Sub-cell prop colliders may legitimately share a tile bucket (for
        // example a barrel and a sack). They are checked by their exact
        // geometry in the Go contract tests, so only conflicting authored
        // tile obstacles count as duplicate cells here.
        if (occupied.has(cellKey) && wall.type !== "city_object" && occupied.get(cellKey).type !== "city_object") duplicateCells.add(cellKey)
        occupied.set(cellKey, wall)
        wallTypes.set(wall.type, (wallTypes.get(wall.type) || 0) + 1)
      }
      const blockingTypes = new Set(["water", "river", "wall", "destructible", "tree", "dead_tree", "menhir", "crates", "ruin_wall", "building_wall", "building_rubble", "fortress_wall", "shipwreck", "pond", "rock"])
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
      const vineCells = [...occupied].filter(([, wall]) => wall.type === "vine").map(([cell]) => cell)
      const vineBlockingCells = [...occupied].filter(([, wall]) => wall.type === "vine" && isBlocking(wall)).map(([cell]) => cell)
      const thornVineBlockingCells = [...occupied].filter(([, wall]) => wall.type === "thorn_vine" && isBlocking(wall)).map(([cell]) => cell)
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
        vineCells: vineCells.length,
        vineBlockingCells,
        thornVineBlockingCells,
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

    const collisionProbe = await page.evaluate(async () => {
      const {createCollisionIndex, movePosition} = await import("/src/components/BattleGame/NetworkSimulation.js")
      const target = window.qa.map.walls.find(wall => wall.type === "city_object" && Number(wall.colliderRadius) > 0)
      const roofTarget = window.qa.map.walls
        .filter(wall => wall.type === "city_object" && !(Number(wall.colliderRadius) > 0))
        .sort((left, right) => (Number(right.maxX) - Number(right.minX)) * (Number(right.maxY) - Number(right.minY)) -
          (Number(left.maxX) - Number(left.minX)) * (Number(left.maxY) - Number(left.minY)))[0]
      const index = createCollisionIndex(window.qa.map.walls)
      const radius = Number(target.colliderRadius)
      const center = {x: (Number(target.minX) + Number(target.maxX)) / 2, y: (Number(target.minY) + Number(target.maxY)) / 2}
      const player = {movementSpeed: 40, radius: 14, flying: 0}
      const start = {x: center.x - radius - player.radius - 60, y: center.y}
      const next = movePosition(start, {x: 1, y: 0}, player, 1.5, window.qa.map, index)
      const roofCenterY = (Number(roofTarget.minY) + Number(roofTarget.maxY)) / 2
      const roofStart = {x: Number(roofTarget.minX) - player.radius - 60, y: roofCenterY}
      const roofNext = movePosition(roofStart, {x: 1, y: 0}, player, 1.5, window.qa.map, index)
      return {
        cityObjectBlockingCount: index.blockingWalls.filter(wall => wall.type === "city_object").length,
        startX: start.x,
        endX: next.x,
        expectedContactX: center.x - radius - player.radius,
        roofStartX: roofStart.x,
        roofEndX: roofNext.x,
        expectedRoofContactX: Number(roofTarget.minX) - player.radius,
      }
    })

    assert.equal(metrics.map.id, expectedMapId)
    assert.equal(metrics.duplicateCollisionCells.length, 0, `duplicate collision cells: ${metrics.duplicateCollisionCells.join(", ")}`)
    assert.equal(collisionProbe.cityObjectBlockingCount, expectedCityObjectBlockingCount)
    assert.equal(collisionProbe.endX <= collisionProbe.expectedContactX + .5, true, `city object probe crossed collider: ${JSON.stringify(collisionProbe)}`)
    assert.equal(collisionProbe.endX > collisionProbe.startX + 1, true, `city object probe did not approach collider: ${JSON.stringify(collisionProbe)}`)
    assert.equal(collisionProbe.roofEndX <= collisionProbe.expectedRoofContactX + .5, true, `roof probe crossed collider: ${JSON.stringify(collisionProbe)}`)
    assert.equal(collisionProbe.roofEndX > collisionProbe.roofStartX + 1, true, `roof probe did not approach collider: ${JSON.stringify(collisionProbe)}`)
    assert.equal(metrics.bridgeCells > 0, true)
    assert.equal(metrics.vineCells >= 24, true)
    assert.deepEqual(metrics.vineBlockingCells, [])
    assert.deepEqual(metrics.thornVineBlockingCells, [])
    assert.equal(metrics.cityFeatures >= 11, true)
    assert.equal(selectedMap === "team-battle" ? (metrics.featureSummary.castle_keep || 0) === 0 : metrics.featureSummary.castle_keep === 2, true)
    assert.equal(selectedMap === "team-battle" ? (metrics.featureSummary.castle_gate || 0) === 0 : metrics.featureSummary.castle_gate === 2, true)
    assert.equal(selectedMap === "team-battle" ? (metrics.featureSummary.castle_house || 0) === 0 : metrics.featureSummary.castle_house === 8, true)
    assert.equal(selectedMap === "team-battle" ? (metrics.featureSummary.castle_market || 0) === 2 : (metrics.featureSummary.castle_market || 0) === 0, true)
    assert.equal((metrics.featureSummary.castle_bastion || 0) === 0, true)
    assert.equal(metrics.baseFeatures, expectedBaseFeatureCount)
    assert.deepEqual(metrics.baseFeatureSummary, expectedBaseFeatureSummary)
    assert.deepEqual(consoleErrors, [])
    assert.deepEqual(pageErrors, [])

    for (const [name, x, y] of sectors) {
      await page.evaluate(({x, y, name}) => {
        const map = window.qa.map
        const tile = map.tileSize || 40
        const target = [Math.floor(map.width * x / tile), Math.floor(map.height * y / tile)]
        const blockingTypes = new Set(["water", "river", "wall", "destructible", "tree", "dead_tree", "menhir", "crates", "ruin_wall", "building_wall", "building_rubble", "fortress_wall", "shipwreck", "pond", "rock"])
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
    for (const [name, x, y] of vineViews) {
      await page.evaluate(({name, x, y}) => {
        const target = {x: x * 40, y: y * 40}
        window.qa.updatePosition(target.x, target.y, name)
        window.qa.battleRenderer.cameraRig.follow(target, {width: window.qa.map.width, height: window.qa.map.height}, 1)
        window.qa.battleRenderer.cameraRig.preferredVertical = 14
        window.qa.battleRenderer.render()
      }, {name, x, y})
      await page.waitForTimeout(220)
      await page.screenshot({path: path.join(output, `${name}.png`), fullPage: true})
    }
    for (const [name, x, y] of detailViews) {
      await page.evaluate(({name, x, y}) => {
        const target = {x: x * 40, y: y * 40}
        window.qa.updatePosition(target.x, target.y, name)
        window.qa.battleRenderer.cameraRig.follow(target, {width: window.qa.map.width, height: window.qa.map.height}, 1)
        window.qa.battleRenderer.cameraRig.preferredVertical = 18
        window.qa.battleRenderer.render()
      }, {name, x, y})
      await page.waitForTimeout(220)
      await page.screenshot({path: path.join(output, `${name}.png`), fullPage: true})
    }
    for (const [name, x, y] of castleViews) {
      await page.evaluate(({name, x, y}) => {
        const target = {x: x * 40, y: y * 40}
        window.qa.updatePosition(target.x, target.y, name)
        window.qa.battleRenderer.cameraRig.follow(target, {width: window.qa.map.width, height: window.qa.map.height}, 1)
        window.qa.battleRenderer.render()
      }, {name, x, y})
      await page.waitForTimeout(220)
      await page.screenshot({path: path.join(output, `${name}.png`), fullPage: true})
    }

    const report = {
      generatedAt: new Date().toISOString(),
      metrics,
      scope: {
        staticTopology: "complete",
        dynamicResourceRoutes: "covered_by_battle_resource_topology_report",
        note: "Cube/bat contest timing and safe drops are covered by the authoritative battle resource-topology report; this browser report covers the canonical map collision, reachability and visual topology.",
      },
      screenshots: sectors.map(([name]) => path.join(output, `${name}.png`)).concat(path.join(output, "overview.png"), baseViews.map(([name]) => path.join(output, `${name}.png`)), cityViews.map(([name]) => path.join(output, `${name}.png`)), vineViews.map(([name]) => path.join(output, `${name}.png`)), detailViews.map(([name]) => path.join(output, `${name}.png`)), castleViews.map(([name]) => path.join(output, `${name}.png`))),
      consoleErrors,
      pageErrors,
    }
    const reportPath = path.join(output, "report.json")
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
    process.stdout.write(JSON.stringify({...report, reportPath}, null, 2))
  },
).catch(error => {
  console.error(error)
  process.exitCode = 1
})
