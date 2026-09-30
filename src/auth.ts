import type { Credential } from "@opencode/plugin"

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

export function toStoredAuth(credential: Credential.Value): StoredAuth {
  if (credential.type === "key") return { type: "api", key: credential.key }

  const accountId = credential.metadata?.accountId
  return {
    type: "oauth",
    access: credential.access,
    refresh: credential.refresh,
    expires: credential.expires,
    ...(typeof accountId === "string" ? { accountId } : {}),
  }
}
