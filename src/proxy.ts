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
  const localeToInitialize = cookieLocale ? undefined : resolvedLocale
  if (localeToInitialize) {
    writeLocaleCookie(req.cookies, localeToInitialize)
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

  if (localeToInitialize) {
    writeLocaleCookie(response.cookies, localeToInitialize)
  }

  return response
}

export const config = {
  matcher: ["/((?!api|_next|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)"]
}
