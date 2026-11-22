export const identityScopes = ["openid", "profile", "email"] as const
export const websiteScope = "csk:website"
export const bookieScope = "csk:bookie"
export const oidcScopes = [...identityScopes, websiteScope, bookieScope] as const

export type OidcScope = (typeof oidcScopes)[number]
