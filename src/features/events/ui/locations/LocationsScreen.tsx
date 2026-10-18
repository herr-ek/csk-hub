import { ExternalLink } from "lucide-react"
import { getTranslations } from "@/core/i18n/server"
import { PageBreadcrumb } from "@/core/navigation/PageBreadcrumb"
import { Badge } from "@/shared/ui/base/badge"
import { Button } from "@/shared/ui/base/button"
import { Card } from "@/shared/ui/base/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/ui/base/collapsible"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { ArchiveLocationDialog, CreateLocationDialog, EditLocationDialog } from "./LocationDialogs"
import { type LocationRow, listLocations } from "./query"

/** The reusable venues Events are held at. Archived ones stay on their Events but are not offered for new ones. */
export async function LocationsScreen() {
  const [locations, t] = await Promise.all([listLocations(), getTranslations("Events.locations")])
  const active = locations.filter((location) => location.active)
  const archived = locations.filter((location) => !location.active)

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-2">
        <PageBreadcrumb route="adminEventLocations" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-semibold">{t("title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
          </div>
          <CreateLocationDialog />
        </div>
      </div>

      {active.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      ) : (
        <LocationList locations={active} />
      )}

      <Collapsible>
        <CollapsibleTrigger render={<Button type="button" variant="ghost" size="sm" />}>
          {t("showArchived", { count: archived.length })}
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          {archived.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noneArchived")}</p>
          ) : (
            <LocationList locations={archived} />
          )}
        </CollapsibleContent>
      </Collapsible>
    </main>
  )
}

async function LocationList({ locations }: { locations: LocationRow[] }) {
  const t = await getTranslations("Events.locations")
  return (
    <Card className="gap-0 divide-y py-0">
      {locations.map((location) => (
        <div key={location.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{location.name}</span>
              {location.active ? null : <Badge variant="secondary">{t("archivedBadge")}</Badge>}
            </div>
            {location.address ? <span className="text-sm text-muted-foreground">{location.address}</span> : null}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>{t("eventCount", { count: location.eventCount })}</span>
              {location.mapUrl ? (
                <a
                  href={location.mapUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-1 underline underline-offset-4"
                >
                  {t("openMap")}
                  <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              ) : null}
            </div>
          </div>
          {location.active ? (
            <div className="flex gap-1">
              <EditLocationDialog location={location} />
              <ArchiveLocationDialog location={location} />
            </div>
          ) : null}
        </div>
      ))}
    </Card>
  )
}

export async function LocationsScreenSkeleton() {
  const t = await getTranslations("Events.locations")
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8" aria-busy="true">
      <div className="flex flex-col gap-2">
        <PageBreadcrumb route="adminEventLocations" />
        <h1 className="font-heading text-2xl font-semibold">{t("title")}</h1>
      </div>
      <Skeleton className="h-40 w-full rounded-xl" />
    </main>
  )
}
