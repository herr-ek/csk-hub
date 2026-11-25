import { describe, expect, test } from "bun:test"
import type { OAuthCatalogue } from "@/core/auth/oauth/catalogue"
import { createClientCommandSchema } from "./client-command"

const catalogue: OAuthCatalogue = {
  userScopes: [{ scope: "user:test:read" }],
  apiScopes: [{ scope: "api:test:read" }]
}

const base = {
  action: "create" as const,
  name: "Website",
  signIn: true,
  redirectUrls: ["https://example.com/callback"],
  scopes: ["profile"],
  claimGroups: ["website-access"],
  clientCredentialsScopes: []
}

describe("admin client command schema", () => {
  const schema = createClientCommandSchema(catalogue)

  test("accepts sign-in clients with user scopes and machine clients with API scopes", () => {
    expect(schema.safeParse({ ...base, scopes: ["profile", "user:test:read"] }).success).toBe(true)
    expect(
      schema.safeParse({
        ...base,
        signIn: false,
        redirectUrls: [],
        scopes: [],
        claimGroups: [],
        clientCredentialsScopes: ["api:test:read"]
      }).success
    ).toBe(true)
  })

  test("rejects API scopes on the login side and user scopes on the machine side", () => {
    expect(schema.safeParse({ ...base, scopes: ["api:test:read"] }).success).toBe(false)
    expect(
      schema.safeParse({
        ...base,
        signIn: false,
        redirectUrls: [],
        scopes: [],
        claimGroups: [],
        clientCredentialsScopes: ["user:test:read"]
      }).success
    ).toBe(false)
  })

  test("requires redirect URLs for sign-in and at least one access kind", () => {
    expect(schema.safeParse({ ...base, redirectUrls: [] }).success).toBe(false)
    expect(
      schema.safeParse({
        ...base,
        signIn: false,
        redirectUrls: [],
        scopes: [],
        claimGroups: [],
        clientCredentialsScopes: []
      }).success
    ).toBe(false)
  })

  test("rejects login settings when sign-in is off", () => {
    expect(
      schema.safeParse({ ...base, signIn: false, redirectUrls: [], clientCredentialsScopes: ["api:test:read"] }).success
    ).toBe(false)
  })

  test("rejects unknown claim groups", () => {
    expect(schema.safeParse({ ...base, claimGroups: ["moderator-access"] }).success).toBe(false)
  })
})
