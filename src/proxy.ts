import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { auth } from "@/core/auth/auth"
import { getRouteAccessDecision } from "@/core/auth/route-access"
import { getLocaleCookieValue, localeCookie, writeLocaleCookie } from "@/core/i18n/locale-cookie"
import { getSavedLocale, resolveLocalePreference } from "@/core/i18n/locale-preference"
import { handleLocaleRouting } from "@/core/i18n/middleware"

export default async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname
  const requestedPath = `${pathname}${req.nextUrl.search}`

  const session = await auth.api.getSession({ headers: req.headers })
  const cookieLocale = getLocaleCookieValue(req.cookies.get(localeCookie.name)?.value)
  const savedLocale = getSavedLocale(session?.user)
  const resolvedLocale = resolveLocalePreference(cookieLocale, savedLocale)

  // A member's saved locale initializes a browser that has no preference yet.
  // A valid NEXT_LOCALE cookie remains a browser-specific override.
  if (!cookieLocale && resolvedLocale) {
    writeLocaleCookie(req.cookies, resolvedLocale)
  }

  const decision = await getRouteAccessDecision(pathname, session, requestedPath)

  let response: NextResponse
  switch (decision.kind) {
    case "redirect": {
      const redirectUrl = new URL(decision.location, req.url)
      response = NextResponse.redirect(redirectUrl)
      break
    }

    case "forbidden":
      response = new NextResponse(null, { status: 403 })
      break

    case "allow":
      response = handleLocaleRouting(req)
      break
  }

  if (!cookieLocale && resolvedLocale) {
    writeLocaleCookie(response.cookies, resolvedLocale)
  }

  return response
}

export const config = {
  matcher: ["/((?!api|_next|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)"]
}
