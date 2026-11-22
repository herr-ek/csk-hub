export const identityScopes = ["openid", "profile", "email"] as const
export const websiteScope = "csk:website"
export const oidcScopes = [...identityScopes, websiteScope] as const

export type OidcScope = (typeof oidcScopes)[number]
