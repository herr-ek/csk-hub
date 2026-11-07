import "server-only"

import type { auth } from "../auth"

/** Resume a signed request after asynchronous sign-in, retaining required activation. */
export async function resumeOidcRequest(request: Request, provider: Pick<typeof auth, "handler">) {
  // This is a server-created continuation, not a browser POST. Keep its own origin
  // and omit email-link Referer/Fetch Metadata; oauth_query still authenticates the request.
  const headers = new Headers({
    Origin: new URL(request.url).origin,
    "Content-Type": "application/json",
    Accept: "application/json"
  })
  const cookie = request.headers.get("cookie")
  if (cookie) headers.set("Cookie", cookie)
  const userAgent = request.headers.get("user-agent")
  if (userAgent) headers.set("User-Agent", userAgent)
  const response = await provider.handler(
    new Request(new URL("/api/auth/oauth2/continue", request.url), {
      method: "POST",
      headers,
      body: JSON.stringify({ oauth_query: new URL(request.url).search.slice(1), created: true })
    })
  )
  if (!response.ok) return response
  const result = await response.json()
  const redirectHeaders = new Headers({
    Location: new URL(result.url, request.url).toString(),
    "Cache-Control": "no-store"
  })
  for (const cookie of response.headers.getSetCookie()) redirectHeaders.append("Set-Cookie", cookie)
  return new Response(null, { status: 302, headers: redirectHeaders })
}
