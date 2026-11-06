type Environment = "development" | "test" | "preview" | "production"

/** Reject an issuer that cannot identify this provider's auth routes securely. */
export function validateOidcIssuer(issuer: string, environment: Environment) {
  const url = new URL(issuer)
  if (
    url.pathname !== "/api/auth" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        (environment === "development" || environment === "test") &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ))
  ) {
    throw new Error("OIDC issuer must be an explicit deployment URL ending in /api/auth")
  }
}

/** Callbacks match exactly; local HTTP is permitted only in development and tests. */
export function validateOidcRedirectUri(redirectUri: string, registered: readonly string[], environment: Environment) {
  const callback = new URL(redirectUri)
  const local = environment === "development" || environment === "test"
  return (
    registered.includes(redirectUri) &&
    (callback.protocol === "https:" ||
      (local && callback.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(callback.hostname)))
  )
}
