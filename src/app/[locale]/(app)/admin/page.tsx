import { Bell, CalendarDays, Contact, KeyRound, Landmark, Mic, Music, User, Users } from "lucide-react"
import Link from "next/link"
import { type ReactNode, Suspense } from "react"
import { requirePermission } from "@/core/authz"
import { app } from "@/core/config/app"
import { getTranslations } from "@/core/i18n/server"
import { ROUTES } from "@/core/navigation/site"
import { getOrgAttention } from "@/features/org-structure"
import { Badge } from "@/shared/ui/base/badge"
import { Card, CardDescription, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Skeleton } from "@/shared/ui/base/skeleton"

type AdminResource = {
  href: string
  title: string
  description: string
  icon: typeof User
  /** What needs attention, such as "2 vacant". */
  attention?: string
}

function AdminResourceCard({ resource }: { resource: AdminResource }) {
  const ResourceIcon = resource.icon
  return (
    <Link href={resource.href} className="group focus-visible:outline-none">
      <Card className="h-full transition-colors group-hover:bg-muted/50 group-focus-visible:ring-2 group-focus-visible:ring-ring">
        <CardHeader className="flex flex-row items-center gap-4">
          <ResourceIcon className="size-12 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {resource.title}
              {resource.attention ? <Badge variant="secondary">{resource.attention}</Badge> : null}
            </CardTitle>
            <CardDescription>{resource.description}</CardDescription>
          </div>
        </CardHeader>
      </Card>
    </Link>
  )
}

type AdminSection = { id: string; title: string; resources: AdminResource[] }

/** The cards under their section headings, with each card drawn by `children`. */
function AdminSections({
  sections,
  busy,
  children
}: {
  sections: AdminSection[]
  busy?: boolean
  children: (resource: AdminResource) => ReactNode
}) {
  return (
    <div className="flex flex-col gap-8" aria-busy={busy}>
      {sections.map((section) => (
        <section key={section.id} aria-labelledby={`admin-${section.id}`} className="flex flex-col gap-4">
          <h2 id={`admin-${section.id}`} className="font-heading text-lg font-semibold">
            {section.title}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{section.resources.map(children)}</div>
        </section>
      ))}
    </div>
  )
}

function AdminResourcesSkeleton({ sections }: { sections: AdminSection[] }) {
  return (
    <AdminSections sections={sections} busy>
      {(resource) => (
        <Card key={resource.href} className="h-full">
          <CardHeader className="flex flex-row items-center gap-4">
            <Skeleton className="size-12 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-full max-w-56" />
            </div>
          </CardHeader>
        </Card>
      )}
    </AdminSections>
  )
}

async function AdminResources({ sections }: { sections: AdminSection[] }) {
  await requirePermission({ action: "admin.access" })
  const [attention, t] = await Promise.all([getOrgAttention(), getTranslations("Admin.attention")])
  const counts: Partial<Record<string, string>> = {
    [ROUTES.adminChoirs]: attention.unplaced > 0 ? t("unplaced", { count: attention.unplaced }) : undefined,
    [ROUTES.adminBoard]: attention.board > 0 ? t("vacant", { count: attention.board }) : undefined,
    [ROUTES.adminChoirPositions]:
      attention.choirPositions > 0 ? t("vacant", { count: attention.choirPositions }) : undefined,
    [ROUTES.adminCommittees]: attention.committees > 0 ? t("missing", { count: attention.committees }) : undefined
  }

  return (
    <AdminSections sections={sections}>
      {(resource) => (
        <AdminResourceCard key={resource.href} resource={{ ...resource, attention: counts[resource.href] }} />
      )}
    </AdminSections>
  )
}

export default async function AdminRoot() {
  const t = await getTranslations("Admin")
  const sections: AdminSection[] = [
    {
      id: "organisation",
      title: t("sections.organisation"),
      resources: [
        { href: ROUTES.adminUsers, title: t("members"), description: t("membersDescription"), icon: User },
        { href: ROUTES.adminBoard, title: t("board"), description: t("boardDescription"), icon: Landmark },
        { href: ROUTES.adminChoirs, title: t("choirs"), description: t("choirsDescription"), icon: Music },
        {
          href: ROUTES.adminChoirPositions,
          title: t("choirPositions"),
          description: t("choirPositionsDescription"),
          icon: Contact
        },
        { href: ROUTES.adminCommittees, title: t("committees"), description: t("committeesDescription"), icon: Users },
        { href: ROUTES.adminGigGroups, title: t("gigGroups"), description: t("gigGroupsDescription"), icon: Mic }
      ]
    },
    {
      id: "hub",
      title: app.name,
      resources: [
        { href: ROUTES.adminEvents, title: t("events"), description: t("eventsDescription"), icon: CalendarDays }
      ]
    },
    {
      id: "advanced",
      title: t("sections.advanced"),
      resources: [
        {
          href: ROUTES.adminOidcClients,
          title: t("oidcClients"),
          description: t("oidcClientsDescription"),
          icon: KeyRound
        },
        {
          href: ROUTES.adminNotifications,
          title: t("notifications"),
          description: t("notificationsDescription"),
          icon: Bell
        }
      ]
    }
  ]
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </div>

      <Suspense fallback={<AdminResourcesSkeleton sections={sections} />}>
        <AdminResources sections={sections} />
      </Suspense>
    </main>
  )
}
