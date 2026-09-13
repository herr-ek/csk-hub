import { Bell, User } from "lucide-react"
import Link from "next/link"
import { Suspense } from "react"
import { requireAdmin } from "@/core/auth/permissions.server"
import { getTranslations } from "@/core/i18n/server"
import { ROUTES } from "@/core/navigation/site"
import { Card, CardDescription, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Skeleton } from "@/shared/ui/base/skeleton"

type AdminResource = { href: string; title: string; description: string; icon: typeof User }

function AdminResourceCard({ resource }: { resource: AdminResource }) {
  const ResourceIcon = resource.icon
  return (
    <Link href={resource.href} className="group focus-visible:outline-none">
      <Card className="h-full transition-colors group-hover:bg-muted/50 group-focus-visible:ring-2 group-focus-visible:ring-ring">
        <CardHeader className="flex flex-row items-center gap-4">
          <ResourceIcon className="size-12 text-muted-foreground" aria-hidden="true" />
          <div>
            <CardTitle>{resource.title}</CardTitle>
            <CardDescription>{resource.description}</CardDescription>
          </div>
        </CardHeader>
      </Card>
    </Link>
  )
}

function AdminResourcesSkeleton({ resources }: { resources: AdminResource[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
      {resources.map((resource) => (
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

async function AdminResources({ resources }: { resources: AdminResource[] }) {
  await requireAdmin()

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {resources.map((resource) => (
        <AdminResourceCard key={resource.href} resource={resource} />
      ))}
    </div>
  )
}

export default async function AdminRoot() {
  const t = await getTranslations("Admin")
  const resources = [
    { href: ROUTES.adminMembers, title: t("members"), description: t("membersDescription"), icon: User },
    {
      href: ROUTES.adminNotifications,
      title: t("notifications"),
      description: t("notificationsDescription"),
      icon: Bell
    }
  ]
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </div>

      <Suspense fallback={<AdminResourcesSkeleton resources={resources} />}>
        <AdminResources resources={resources} />
      </Suspense>
    </main>
  )
}
