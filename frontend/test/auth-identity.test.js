import assert from "node:assert/strict"
import test from "node:test"
import {readFile} from "node:fs/promises"

test("development identity survives browser and server restarts", async () => {
  const source = await readFile(new URL("../src/utils/auth.js", import.meta.url), "utf8")
  assert.match(source, /localStorage\.setItem\("dev_user_id"/)
  assert.match(source, /localStorage\.getItem\("dev_user_id"/)
  assert.match(source, /sessionStorage\.getItem\("dev_user_id"/)
  assert.doesNotMatch(source, /sessionStorage\.setItem\("dev_user_id"/)
})
