import assert from "node:assert/strict"
import test from "node:test"
import { toStoredAuth } from "../src/auth.js"

test("converts an OpenCode API key credential", () => {
  assert.deepEqual(toStoredAuth({ type: "key", key: "test-key" } as never), { type: "api", key: "test-key" })
})

test("converts an OpenCode OAuth credential", () => {
  const auth = toStoredAuth({
    type: "oauth",
    methodID: "chatgpt" as never,
    access: "access",
    refresh: "refresh",
    expires: 123,
    metadata: { accountId: "acct" },
  } as never)
  assert.deepEqual(auth, { type: "oauth", access: "access", refresh: "refresh", expires: 123, accountId: "acct" })
})
