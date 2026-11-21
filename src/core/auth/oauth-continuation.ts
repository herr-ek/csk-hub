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

/** Recognizes the provider's rejection of an expired or invalid signed authorization request. */
export function isInvalidOAuthSignature(error: object): boolean {
  return "error" in error && error.error === "invalid_signature"
}

/** Restarts authorization after a lost verification response using the newly established session. */
export function getOAuthResumePath(search: string, sessionCreatedAt: Date): string | undefined {
  const signed = new URLSearchParams(search)
  const issuedAt = Number(signed.get("ba_iat"))
  if (!signed.has("sig") || !Number.isFinite(issuedAt) || issuedAt <= 0 || !(sessionCreatedAt.getTime() >= issuedAt)) {
    return
  }

  const names = new Set(signed.getAll("ba_param"))
  const query = new URLSearchParams(
    [...signed].filter(([key]) => names.has(key) && key !== "sig" && key !== "exp" && !key.startsWith("ba_"))
  )
  if (!query.has("client_id")) return

  // The recovered sign-in already satisfied forced login. Preserve other prompts, including consent.
  const prompts = query
    .get("prompt")
    ?.split(" ")
    .filter((prompt) => prompt !== "login")
  if (prompts?.length) query.set("prompt", prompts.join(" "))
  else query.delete("prompt")
  query.delete("max_age")

  return `/api/auth/oauth2/authorize?${query}`
}
