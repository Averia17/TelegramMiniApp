---
name: browser-qa
description: |
  Playwright-based browser QA testing for the Telegram Mini App frontend.
  Use when:
  (1) Running visual/regression tests on game UI components,
  (2) Validating hero animations in the browser,
  (3) Testing responsive layouts or mobile behavior,
  (4) Checking WebGL/Three.js rendering,
  (5) Any task mentioning "playwright", "browser qa", "visual test", "screenshot test", "e2e".
  Trigger on mentions of "qa", "playwright", "browser test", "visual regression", "screenshot", "chromium", "headless".
---

# Browser QA — Telegram Mini App Game

## Architecture

```
tools/qa/
  playwright-runner.cjs              # Core runner (launch + lifecycle)
  playwright-runner.test.cjs         # Unit tests for the runner itself
  *-browser-qa.cjs                   # Individual QA test scripts

frontend/test/                       # Node:test unit tests (not Playwright)
  *.test.js                          # Component contract tests
```

## The Runner (`playwright-runner.cjs`)

Provides two key utilities:

- `launchHeadlessChromium(chromium, options)` — launches Chromium with `channel: "chromium"`, never forces `--disable-gpu`
- `runWithBrowser(launchBrowser, run, {maxRuntimeMs})` — manages browser lifecycle, SIGINT/SIGTERM handling, timeout

**Always use `runWithBrowser` for QA scripts** — it guarantees the browser closes even on errors or interrupts.

## Running a QA Script

```bash
cd C:\Users\User\PycharmProjects\TelegramMiniApp

# Requires frontend dev server running
node tools/qa/hero-select-card-browser-qa.cjs

# With custom URL
set HERO_SELECT_QA_URL=http://localhost:3000 && node tools/qa/hero-select-card-browser-qa.cjs
```

## QA Script Pattern

Every `*-browser-qa.cjs` follows this structure:

```javascript
const {chromium} = require("playwright")
const {launchHeadlessChromium, runWithBrowser} = require("./playwright-runner.cjs")

const baseUrl = process.env.MY_QA_URL || "http://localhost:5173"
const output = path.resolve(__dirname, "../../output/playwright/my-test.png")

runWithBrowser(
  () => launchHeadlessChromium(chromium, {headless: true}),
  async browser => {
    const page = await browser.newPage({viewport: {width: 1400, height: 900}})
    
    // Collect errors
    const consoleErrors = []
    const pageErrors = []
    page.on("console", msg => { if (msg.type() === "error") consoleErrors.push(msg.text()) })
    page.on("pageerror", err => pageErrors.push(err.stack || String(err)))
    
    // Mock API routes (standard pattern)
    await page.route("**/api/**", async route => {
      const pathname = new URL(route.request().url()).pathname
      if (pathname.endsWith("/auth/telegram")) {
        return route.fulfill({json: {access_token: "qa", user_id: 920000001}})
      }
      if (pathname.endsWith("/economy/me")) {
        return route.fulfill({json: {energy: 100, max_energy: 100, gold: 0, crystals: 0}})
      }
      return route.fulfill({json: {}})
    })
    
    await page.goto(`${baseUrl}/?devUser=920000001`, {waitUntil: "domcontentloaded"})
    
    // Test assertions...
    assert.deepEqual(consoleErrors, [])
    assert.deepEqual(pageErrors, [])
    
    await page.screenshot({path: output, fullPage: true})
  },
)
```

## Common QA Targets

| Script | What it tests |
|--------|---------------|
| `hero-select-card-browser-qa.cjs` | Hero roster card layout, selection state |
| `death-animation-browser-qa.cjs` | Death animation visuals |
| `hero-skill-animation-browser-qa.cjs` | Skill animation playback |
| `katty-animation-browser-qa.cjs` | Katty-specific animations |
| `map-environment-browser-qa.cjs` | Map/environment rendering |
| `mobile-responsive-browser-qa.cjs` | Mobile viewport behavior |
| `battle-performance-browser-qa.cjs` | Battle scene performance |
| `combat-feedback-browser-qa.cjs` | Combat UI feedback |
| `melee-range-browser-qa.cjs` | Melee attack range indicators |
| `attack-reload-indicator-browser-qa.cjs` | Reload UI states |

## Environment Variables

| Var | Default | Purpose |
|-----|---------|---------|
| `HERO_SELECT_QA_URL` | `http://localhost:5173` | Base URL for hero-select QA |
| `PLAYWRIGHT_QA_TIMEOUT_MS` | `60000` | Max runtime per QA script |

## Output

Screenshots are saved to `output/playwright/*.png` for visual verification.

## Dev Server Requirement

Most QA scripts need the frontend dev server running:

```bash
cd frontend
npm run dev
```

## WebGL / Three.js Notes

- The runner intentionally **does not** pass `--disable-gpu` so WebGL renders properly in headless Chromium
- For CI/container environments without GPU, additional flags may be needed
