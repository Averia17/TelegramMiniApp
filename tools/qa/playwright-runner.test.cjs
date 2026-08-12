const test = require("node:test")
const assert = require("node:assert/strict")
const {EventEmitter} = require("node:events")
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

test("does not force headless Chromium to render WebGL on the CPU", async () => {
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
    channel: "chromium",
    headless: true,
    args: ["--disable-background-timer-throttling"],
  })
  assert.equal(launchOptions.args.includes("--disable-gpu"), false)
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

test("times out a stuck Playwright task and closes its browser", async () => {
  let closeCalls = 0
  const browser = {close: async () => { closeCalls += 1 }}
  const stuckTask = runWithBrowser(
    async () => browser,
    async () => new Promise(() => {}),
    {maxRuntimeMs: 10},
  )

  await assert.rejects(
    Promise.race([
      stuckTask,
      new Promise((_, reject) => setTimeout(() => reject(new Error("regression guard expired")), 100)),
    ]),
    /Playwright task exceeded 10ms/,
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
