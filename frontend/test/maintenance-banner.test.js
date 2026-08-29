import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

test("lobby exposes the public maintenance status and banner", () => {
  const page = fs.readFileSync(new URL("../src/pages/landing-page.jsx", import.meta.url), "utf8")
  const nginx = fs.readFileSync(new URL("../../nginx/prod.conf", import.meta.url), "utf8")
  assert.match(page, /\/maintenance/)
  assert.match(page, /lp-maintenance/)
  assert.match(nginx, /location = \/api\/battle\/maintenance/)
})
