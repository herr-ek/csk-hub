import { headers } from "next/headers"
import Link from "next/link"
import { auth } from "@/core/auth/auth"
import { ROUTES } from "@/core/navigation/site"
import { buttonVariants } from "@/shared/ui/base/button"
import { Card, CardContent } from "@/shared/ui/base/card"
import { Skeleton } from "@/shared/ui/base/skeleton"

export async function MemberProfileScreen() {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) return null

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">My account</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your CSK Hub profile.</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-start gap-5">
          <dl className="grid gap-4 text-sm">
            <div>
              <dt className="font-medium">Name</dt>
              <dd className="mt-1 text-muted-foreground">{session.user.name}</dd>
            </div>
            <div>
              <dt className="font-medium">Email</dt>
              <dd className="mt-1 text-muted-foreground">{session.user.email}</dd>
            </div>
          </dl>
          <Link href={ROUTES.accountSettings} className={buttonVariants()}>
            Account settings
          </Link>
        </CardContent>
      </Card>
    </main>
  )
}

export function MemberProfileScreenSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6" aria-busy="true">
      <div>
        <Skeleton className="h-8 w-36" />
        <Skeleton className="mt-2 h-4 w-48" />
      </div>
      <Card>
        <CardContent className="flex flex-col gap-5">
          <div className="grid gap-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-52" />
          </div>
          <Skeleton className="h-9 w-36" />
        </CardContent>
      </Card>
    </main>
  )
}
