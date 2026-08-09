const test = require("node:test")
const assert = require("node:assert/strict")
const {EventEmitter} = require("node:events")
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

test("launches headless Chromium without the runaway GPU process", async () => {
  let launchOptions
  const browser = {close: async () => {}}
  const chromium = {
    launch: async options => {
      launchOptions = options
      return browser
    },
  }

  const result = await launchHeadlessChromium(chromium, {
    headless: true,
    args: ["--disable-background-timer-throttling"],
  })

  assert.equal(result, browser)
  assert.deepEqual(launchOptions, {
    headless: true,
    args: ["--disable-gpu", "--disable-background-timer-throttling"],
  })
})

test("closes the browser when the Playwright task fails", async () => {
  let closeCalls = 0
  const browser = {close: async () => { closeCalls += 1 }}

  await assert.rejects(
    runWithBrowser(async () => browser, async () => {
      throw new Error("qa failed")
    }),
    /qa failed/,
  )

  assert.equal(closeCalls, 1)
})

test("closes the browser on SIGINT and exits with the interrupt code", async () => {
  const processLike = new EventEmitter()
  processLike.exitCode = 0
  let exitCalls = 0
  processLike.exit = () => { exitCalls += 1 }
  let releaseTask
  const taskFinished = new Promise(resolve => { releaseTask = resolve })
  let closeCalls = 0
  const browser = {close: async () => { closeCalls += 1 }}

  const run = runWithBrowser(async () => browser, async () => taskFinished, {processLike})
  await new Promise(resolve => setImmediate(resolve))
  processLike.emit("SIGINT")
  releaseTask()
  await run
  await new Promise(resolve => setImmediate(resolve))

  assert.equal(closeCalls, 1)
  assert.equal(processLike.exitCode, 130)
  assert.equal(exitCalls, 1)
})
