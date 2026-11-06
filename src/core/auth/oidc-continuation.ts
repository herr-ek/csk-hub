/** Keeps only the provider-signed request fields while moving between authentication steps. */
export function getAuthorizationQuery(search: string): string | undefined {
  const params = new URLSearchParams(search)
  if (!params.has("sig") || !params.has("ba_param")) return undefined
  const names = new Set([...params.getAll("ba_param"), "sig", "ba_param"])
  const signed = new URLSearchParams()
  for (const [key, value] of params) if (names.has(key)) signed.append(key, value)
  return signed.toString()
}

/** Adds the signed request without allowing it to supply a navigation destination. */
export function withAuthorizationQuery(path: string, search: string): string {
  const query = getAuthorizationQuery(search)
  return query ? `${path}${path.includes("?") ? "&" : "?"}${query}` : path
}
