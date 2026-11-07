import { getBaseURL } from "../base-url"

type Environment = "development" | "test" | "preview" | "production"

/** Stable issuer from the configured auth origin. Previews use the deployment fallback,
 * so accessing a branch alias cannot change the provider's identity.
 */
export function getOidcIssuer(environment: Parameters<typeof getBaseURL>[0]) {
  const baseURL = getBaseURL(environment)
  const url = new URL("/api/auth", typeof baseURL === "string" ? baseURL : baseURL.fallback)
  const local = environment.ENVIRONMENT === "development" || environment.ENVIRONMENT === "test"
  if (
    url.username ||
    url.password ||
    (url.protocol !== "https:" &&
      !(local && url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
  ) {
    throw new Error("The auth origin must use HTTPS, or loopback HTTP in development/test")
  }
  return url.toString()
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
