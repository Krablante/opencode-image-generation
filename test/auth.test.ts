import assert from "node:assert/strict"
import test from "node:test"
import { ensureFreshAuth, extractAccountId, parseJwtClaims, refreshOAuth } from "../src/auth.js"

function jwt(payload: object): string {
  return `x.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.x`
}

test("extracts ChatGPT account id from nested claims", () => {
  const access = jwt({ "https://api.openai.com/auth": { chatgpt_account_id: "acct_test" } })
  assert.equal(parseJwtClaims(access)?.["https://api.openai.com/auth"]?.chatgpt_account_id, "acct_test")
  assert.equal(extractAccountId({ access_token: access }), "acct_test")
})

test("refreshes expired OAuth and preserves account id and refresh token", async () => {
  const fetcher: typeof fetch = async () =>
    new Response(JSON.stringify({ access_token: "new-access", expires_in: 3600 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  const refreshed = await refreshOAuth(
    { type: "oauth", access: "old", refresh: "keep-me", expires: 0, accountId: "acct" },
    fetcher,
  )
  assert.equal(refreshed.access, "new-access")
  assert.equal(refreshed.refresh, "keep-me")
  assert.equal(refreshed.accountId, "acct")
})

test("persists a refreshed OAuth credential", async () => {
  let persisted = ""
  const result = await ensureFreshAuth(
    { type: "oauth", access: "old", refresh: "refresh", expires: 0 },
    async (auth) => {
      persisted = auth.access
    },
    async () =>
      new Response(JSON.stringify({ access_token: "new", refresh_token: "next", expires_in: 3600 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  )
  assert.equal(result.type, "oauth")
  assert.equal(persisted, "new")
})
