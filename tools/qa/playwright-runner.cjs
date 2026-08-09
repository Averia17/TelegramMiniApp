const SIGNAL_EXIT_CODES = {
  SIGINT: 130,
  SIGTERM: 143,
}

const HEADLESS_CHROMIUM_ARGS = ["--disable-gpu"]

const launchHeadlessChromium = (chromium, options = {}) => chromium.launch({
  ...options,
  args: [...HEADLESS_CHROMIUM_ARGS, ...(options.args || [])],
})

/**
 * Run a Playwright task and always close its browser, including on errors and
 * interrupt signals. A single close promise prevents duplicate close calls
 * when a signal arrives while the task is unwinding its finally block.
 */
async function runWithBrowser(launchBrowser, run, {processLike = process} = {}) {
  let browser = null
  let closePromise = null
  let signalHandled = false

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
    return await run(browser)
  } finally {
    processLike.removeListener("SIGINT", onSigint)
    processLike.removeListener("SIGTERM", onSigterm)
    await closeBrowser()
  }
}

module.exports = {launchHeadlessChromium, runWithBrowser}
