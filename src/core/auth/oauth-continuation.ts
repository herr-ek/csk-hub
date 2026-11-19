/** Better Auth's redirect plugin performs navigation; callers must not replace it with Hub navigation. */
export function isOAuthRedirect(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    "redirect" in data &&
    data.redirect === true &&
    "url" in data &&
    typeof data.url === "string"
  )
}

/** Carries the signed authorization query across Hub's two-factor page without losing repeated keys. */
export function withOAuthQuery(path: string, search: string): string {
  const source = new URLSearchParams(search)
  if (!source.has("sig")) return path
  const target = new URL(path, "http://csk-hub.local")
  const keys = new Set(["sig", "exp", "ba_iat", "ba_param", ...source.getAll("ba_param")])
  for (const [key, value] of source) {
    if (keys.has(key)) target.searchParams.append(key, value)
  }
  return `${target.pathname}${target.search}`
}
