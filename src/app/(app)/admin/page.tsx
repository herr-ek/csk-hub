import { BellIcon, UserIcon } from "lucide-react"
import Link from "next/link"
import { Suspense } from "react"
import { requireAdmin } from "@/core/auth/permissions.server"
import { ROUTES } from "@/core/navigation/site"
import { Card, CardDescription, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Skeleton } from "@/shared/ui/base/skeleton"

const ADMIN_RESOURCES = [
  { href: ROUTES.adminMembers, title: "Members", description: "View and manage Hub members.", icon: UserIcon },
  {
    href: ROUTES.adminNotifications,
    title: "Notifications",
    description: "Util for push notifications.",
    icon: BellIcon
  }
] as const
type AdminResource = (typeof ADMIN_RESOURCES)[number]

function AdminResourceCard({ resource }: { resource: AdminResource }) {
  const Icon = resource.icon
  return (
    <Link href={resource.href} className="group focus-visible:outline-none">
      <Card className="h-full transition-colors group-hover:bg-muted/50 group-focus-visible:ring-2 group-focus-visible:ring-ring">
        <CardHeader className="flex flex-row items-center gap-4">
          <Icon className="size-12 text-muted-foreground" aria-hidden="true" />
          <div>
            <CardTitle>{resource.title}</CardTitle>
            <CardDescription>{resource.description}</CardDescription>
          </div>
        </CardHeader>
      </Card>
    </Link>
  )
}

function AdminResourcesSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
      {ADMIN_RESOURCES.map((resource) => (
        <Card key={resource.href} className="h-full">
          <CardHeader className="flex flex-row items-center gap-4">
            <Skeleton className="size-12 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-full max-w-56" />
            </div>
          </CardHeader>
        </Card>
      ))}
    </div>
  )
}

async function AdminResources() {
  await requireAdmin()

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {ADMIN_RESOURCES.map((resource) => (
        <AdminResourceCard key={resource.href} resource={resource} />
      ))}
    </div>
  )
}

export default function AdminRoot() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Admin</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage CSK Hub resources.</p>
      </div>

      <Suspense fallback={<AdminResourcesSkeleton />}>
        <AdminResources />
      </Suspense>
    </main>
  )
}
