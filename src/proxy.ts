import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { auth } from "@/core/auth/auth"
import { getRouteAccessDecision } from "@/core/auth/route-access"

export default async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname
  const requestedPath = `${pathname}${req.nextUrl.search}`

  const session = await auth.api.getSession({ headers: req.headers })
  const decision = await getRouteAccessDecision(pathname, session, requestedPath)

  switch (decision.kind) {
    case "redirect": {
      const redirectUrl = new URL(decision.location, req.url)
      return NextResponse.redirect(redirectUrl)
    }

    case "forbidden":
      return new NextResponse(null, { status: 403 })

    case "allow":
      return NextResponse.next()
  }
}

export const config = {
  matcher: ["/((?!api|_next|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)"]
}
