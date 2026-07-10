import { createHash, randomBytes } from "node:crypto"
import { createServer, type Server } from "node:http"
import type { AuthHook } from "@opencode-ai/plugin"
import { OAUTH_CLIENT_ID, OAUTH_ISSUER, OAUTH_PORT, USER_AGENT } from "./constants.js"

export type ApiAuth = {
  type: "api"
  key: string
}

export type OAuthAuth = {
  type: "oauth"
  access: string
  refresh: string
  expires: number
  accountId?: string
}

export type StoredAuth = ApiAuth | OAuthAuth

type TokenResponse = {
  id_token?: string
  access_token: string
  refresh_token?: string
  expires_in?: number
}

type IdTokenClaims = {
  chatgpt_account_id?: string
  "https://api.openai.com/auth"?: { chatgpt_account_id?: string }
  organizations?: Array<{ id: string }>
}

type PkceCodes = { verifier: string; challenge: string }

type PendingOAuth = {
  pkce: PkceCodes
  state: string
  resolve: (tokens: TokenResponse) => void
  reject: (error: Error) => void
}

let oauthServer: Server | undefined
let pendingOAuth: PendingOAuth | undefined

function base64Url(input: Buffer | Uint8Array): string {
  return Buffer.from(input).toString("base64url")
}

export function parseJwtClaims(token: string): IdTokenClaims | undefined {
  const parts = token.split(".")
  if (parts.length !== 3) return undefined
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as IdTokenClaims
  } catch {
    return undefined
  }
}

export function extractAccountId(tokens: Pick<TokenResponse, "id_token" | "access_token">): string | undefined {
  for (const token of [tokens.id_token, tokens.access_token]) {
    if (!token) continue
    const claims = parseJwtClaims(token)
    const accountId =
      claims?.chatgpt_account_id ??
      claims?.["https://api.openai.com/auth"]?.chatgpt_account_id ??
      claims?.organizations?.[0]?.id
    if (accountId) return accountId
  }
  return undefined
}

async function generatePkce(): Promise<PkceCodes> {
  const verifier = base64Url(randomBytes(32))
  const challenge = base64Url(createHash("sha256").update(verifier).digest())
  return { verifier, challenge }
}

function buildAuthorizeUrl(redirectUri: string, pkce: PkceCodes, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: OAUTH_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: "openid profile email offline_access",
    code_challenge: pkce.challenge,
    code_challenge_method: "S256",
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true",
    state,
    originator: "opencode-image-generation",
  })
  return `${OAUTH_ISSUER}/oauth/authorize?${params.toString()}`
}

async function exchangeCode(code: string, redirectUri: string, pkce: PkceCodes, fetcher: typeof fetch): Promise<TokenResponse> {
  const response = await fetcher(`${OAUTH_ISSUER}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: OAUTH_CLIENT_ID,
      code_verifier: pkce.verifier,
    }),
  })
  if (!response.ok) throw new Error(`OpenAI token exchange failed (${response.status})`)
  return (await response.json()) as TokenResponse
}

export async function refreshOAuth(
  auth: OAuthAuth,
  fetcher: typeof fetch = fetch,
): Promise<OAuthAuth> {
  const response = await fetcher(`${OAUTH_ISSUER}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: auth.refresh,
      client_id: OAUTH_CLIENT_ID,
    }),
  })
  if (!response.ok) throw new Error(`OpenAI OAuth refresh failed (${response.status})`)
  const tokens = (await response.json()) as TokenResponse
  return {
    type: "oauth",
    access: tokens.access_token,
    refresh: tokens.refresh_token ?? auth.refresh,
    expires: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    accountId: auth.accountId ?? extractAccountId(tokens),
  }
}

export async function ensureFreshAuth(
  auth: StoredAuth,
  persist: (auth: OAuthAuth) => Promise<void>,
  fetcher: typeof fetch = fetch,
): Promise<StoredAuth> {
  if (auth.type !== "oauth" || auth.expires > Date.now() + 60_000) return auth
  const refreshed = await refreshOAuth(auth, fetcher)
  await persist(refreshed)
  return refreshed
}

function renderPage(title: string, message: string): string {
  return `<!doctype html><meta charset="utf-8"><title>${title}</title><style>body{font:16px system-ui;max-width:42rem;margin:12vh auto;padding:0 1rem;color:#18181b}h1{font-size:1.5rem}</style><h1>${title}</h1><p>${message}</p>`
}

async function startOAuthServer(fetcher: typeof fetch): Promise<string> {
  if (oauthServer) return `http://localhost:${OAUTH_PORT}/auth/callback`
  oauthServer = createServer((request, response) => {
    const url = new URL(request.url ?? "/", `http://localhost:${OAUTH_PORT}`)
    if (url.pathname !== "/auth/callback") {
      response.writeHead(404).end("Not found")
      return
    }
    const error = url.searchParams.get("error_description") ?? url.searchParams.get("error")
    const code = url.searchParams.get("code")
    const state = url.searchParams.get("state")
    if (error || !code || !pendingOAuth || state !== pendingOAuth.state) {
      const reason = error ?? (!code ? "Missing authorization code" : "Invalid OAuth state")
      pendingOAuth?.reject(new Error(reason))
      pendingOAuth = undefined
      response.writeHead(400, { "Content-Type": "text/html; charset=utf-8" })
      response.end(renderPage("Authorization failed", reason))
      return
    }
    const current = pendingOAuth
    pendingOAuth = undefined
    exchangeCode(code, `http://localhost:${OAUTH_PORT}/auth/callback`, current.pkce, fetcher)
      .then(current.resolve)
      .catch(current.reject)
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
    response.end(renderPage("Authorization complete", "You can close this window and return to OpenCode."))
  })
  await new Promise<void>((resolve, reject) => {
    oauthServer!.once("error", reject)
    oauthServer!.listen(OAUTH_PORT, "localhost", resolve)
  })
  return `http://localhost:${OAUTH_PORT}/auth/callback`
}

function waitForOAuthCallback(pkce: PkceCodes, state: string): Promise<TokenResponse> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingOAuth = undefined
      reject(new Error("OAuth callback timed out"))
    }, 5 * 60 * 1000)
    pendingOAuth = {
      pkce,
      state,
      resolve: (tokens) => {
        clearTimeout(timeout)
        resolve(tokens)
      },
      reject: (error) => {
        clearTimeout(timeout)
        reject(error)
      },
    }
  })
}

function success(tokens: TokenResponse) {
  return {
    type: "success" as const,
    refresh: tokens.refresh_token ?? "",
    access: tokens.access_token,
    expires: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    accountId: extractAccountId(tokens),
  }
}

export function createAuthMethods(fetcher: typeof fetch = fetch): AuthHook["methods"] {
  return [
    {
      label: "ChatGPT Plus/Pro (browser)",
      type: "oauth",
      authorize: async () => {
        const redirectUri = await startOAuthServer(fetcher)
        const pkce = await generatePkce()
        const state = base64Url(randomBytes(32))
        const callback = waitForOAuthCallback(pkce, state)
        return {
          url: buildAuthorizeUrl(redirectUri, pkce, state),
          instructions: "Complete authorization in your browser.",
          method: "auto" as const,
          callback: async () => {
            try {
              return success(await callback)
            } finally {
              oauthServer?.close()
              oauthServer = undefined
            }
          },
        }
      },
    },
    {
      label: "ChatGPT Plus/Pro (headless)",
      type: "oauth",
      authorize: async () => {
        const response = await fetcher(`${OAUTH_ISSUER}/api/accounts/deviceauth/usercode`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
          body: JSON.stringify({ client_id: OAUTH_CLIENT_ID }),
        })
        if (!response.ok) throw new Error(`Device authorization failed (${response.status})`)
        const device = (await response.json()) as { device_auth_id: string; user_code: string; interval: string }
        const interval = Math.max(Number.parseInt(device.interval, 10) || 5, 1) * 1000
        return {
          url: `${OAUTH_ISSUER}/codex/device`,
          instructions: `Enter code: ${device.user_code}`,
          method: "auto" as const,
          callback: async () => {
            for (;;) {
              const poll = await fetcher(`${OAUTH_ISSUER}/api/accounts/deviceauth/token`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
                body: JSON.stringify({ device_auth_id: device.device_auth_id, user_code: device.user_code }),
              })
              if (poll.ok) {
                const code = (await poll.json()) as { authorization_code: string; code_verifier: string }
                const token = await fetcher(`${OAUTH_ISSUER}/oauth/token`, {
                  method: "POST",
                  headers: { "Content-Type": "application/x-www-form-urlencoded" },
                  body: new URLSearchParams({
                    grant_type: "authorization_code",
                    code: code.authorization_code,
                    redirect_uri: `${OAUTH_ISSUER}/deviceauth/callback`,
                    client_id: OAUTH_CLIENT_ID,
                    code_verifier: code.code_verifier,
                  }),
                })
                if (!token.ok) throw new Error(`OpenAI token exchange failed (${token.status})`)
                return success((await token.json()) as TokenResponse)
              }
              if (poll.status !== 403 && poll.status !== 404) return { type: "failed" as const }
              await new Promise((resolve) => setTimeout(resolve, interval + 3000))
            }
          },
        }
      },
    },
    { label: "OpenAI API key", type: "api" },
  ]
}
