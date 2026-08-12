const SIGNAL_EXIT_CODES = {
  SIGINT: 130,
  SIGTERM: 143,
}

const DEFAULT_MAX_RUNTIME_MS = 60_000

const launchHeadlessChromium = (chromium, options = {}) => chromium.launch({
  channel: "chromium",
  ...options,
  args: [...(options.args || [])],
})

/**
 * Run a Playwright task and always close its browser, including on errors and
 * interrupt signals. A single close promise prevents duplicate close calls
 * when a signal arrives while the task is unwinding its finally block.
 */
async function runWithBrowser(
  launchBrowser,
  run,
  {
    processLike = process,
    maxRuntimeMs = Number(process.env.PLAYWRIGHT_QA_TIMEOUT_MS || DEFAULT_MAX_RUNTIME_MS),
  } = {},
) {
  let browser = null
  let closePromise = null
  let signalHandled = false
  let runtimeTimer = null

  const closeBrowser = () => {
    if (!browser) return Promise.resolve()
    if (!closePromise) closePromise = Promise.resolve().then(() => browser.close())
    return closePromise
  }

  const onSignal = (signal) => {
    if (signalHandled) return
    signalHandled = true
    void closeBrowser()
      .catch(() => {})
      .finally(() => {
        processLike.exitCode = SIGNAL_EXIT_CODES[signal] || 1
        processLike.exit()
      })
  }

  const onSigint = () => onSignal("SIGINT")
  const onSigterm = () => onSignal("SIGTERM")
  processLike.once("SIGINT", onSigint)
  processLike.once("SIGTERM", onSigterm)

  try {
    browser = await launchBrowser()
    if (!Number.isFinite(maxRuntimeMs) || maxRuntimeMs <= 0) {
      throw new TypeError("maxRuntimeMs must be a positive finite number")
    }
    const runtimeExpired = new Promise((_, reject) => {
      runtimeTimer = setTimeout(
        () => reject(new Error(`Playwright task exceeded ${maxRuntimeMs}ms`)),
        maxRuntimeMs,
      )
      runtimeTimer.unref?.()
    })
    return await Promise.race([run(browser), runtimeExpired])
  } finally {
    if (runtimeTimer) clearTimeout(runtimeTimer)
    processLike.removeListener("SIGINT", onSigint)
    processLike.removeListener("SIGTERM", onSigterm)
    await closeBrowser()
  }
}

module.exports = {launchHeadlessChromium, runWithBrowser}
