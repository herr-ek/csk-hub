/**
 * The OIDC scopes and claim groups a Hub client can be granted. Plain data only: client
 * components import this module for the form, so it must not pull in the database.
 */

/** The sign-in switch. Granting it also grants the `authorization_code` grant. */
export const signInScope = "openid"

/** Standard OIDC scopes an Admin can tick under the sign-in section. */
export const standardLoginScopes = ["profile", "email"] as const

/**
 * A Hub-owned scope. `user:` entries are delegated access, `api:` entries are machine access;
 * neither kind exists yet, so both catalogues are empty.
 */
export type CatalogueScope = { readonly scope: string }

export type OAuthCatalogue = {
  readonly userScopes: readonly CatalogueScope[]
  readonly apiScopes: readonly CatalogueScope[]
}

export const oauthCatalogue: OAuthCatalogue = { userScopes: [], apiScopes: [] }

/**
 * Claim groups are checkboxes an Admin enables per client. Each one releases a single list-valued
 * claim computed by the Hub for the signed-in User. Who qualifies is decided by the server.
 */
export const claimGroups = [
  { id: "website-access", claim: "https://chalmerssangkor.se/claims/website-roles" },
  { id: "bookie-access", claim: "https://chalmerssangkor.se/claims/bookie-roles" }
] as const

export type ClaimGroup = (typeof claimGroups)[number]
export type ClaimGroupId = ClaimGroup["id"]

export const claimGroupIds = claimGroups.map((group) => group.id) as [ClaimGroupId, ...ClaimGroupId[]]

/** Every scope the provider may issue, in the order discovery advertises them. */
export function providerScopes(catalogue: OAuthCatalogue): string[] {
  return [
    signInScope,
    ...standardLoginScopes,
    ...catalogue.userScopes.map((entry) => entry.scope),
    ...catalogue.apiScopes.map((entry) => entry.scope)
  ]
}
