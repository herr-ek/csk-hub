import { getTranslations } from "@/core/i18n/server"
import { PageBreadcrumb } from "@/core/navigation/PageBreadcrumb"
import { ROUTES } from "@/core/navigation/site"
import { GroupType, positionCodeKey } from "@/core/org-structure"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { yearLabel } from "../../roster"
import { HistoryLink } from "../HistoryLink"
import { PeopleProvider } from "../PeopleContext"
import { loadChoirPositions } from "../queries"
import { SlotRow } from "./SlotRow"

/** Every Choir's Positions side by side, with Föräldramötet below; annual ones show next year too. */
export async function ChoirPositionsScreen() {
  const [data, t, labels] = await Promise.all([
    loadChoirPositions(),
    getTranslations("OrgAdmin"),
    getTranslations("Groups.positionLabels")
  ])
  const { choirs, slots, nextSlots, parents, helpers, nextHelpers, people, today, currentYear } = data
  const secretary = parents.find(({ contextType }) => contextType === GroupType.Board)
  const withYear = (slot: (typeof slots)[number]) =>
    slot.organisationYear === null
      ? labels(positionCodeKey(slot.positionCode))
      : t("positions.inYear", {
          name: labels(positionCodeKey(slot.positionCode)),
          year: yearLabel(slot.organisationYear)
        })
  return (
    <PeopleProvider people={people} today={today}>
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <PageBreadcrumb route="adminChoirPositions" />
        <div>
          <h1 className="font-heading text-2xl font-semibold">{t("choirPositions.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("choirPositions.description")}</p>
        </div>
        <div className="grid items-start gap-4 lg:grid-cols-3">
          {choirs.map((choir) => (
            <Card key={choir.id}>
              <CardHeader>
                <CardTitle>{choir.name}</CardTitle>
                <CardAction>
                  <HistoryLink groupId={choir.id} />
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-col divide-y">
                {slots
                  .filter((slot) => slot.choir?.id === choir.id)
                  .map((slot) => {
                    const next = nextSlots.find(({ key }) => key === slot.key)
                    return (
                      <div key={slot.key} className="py-2 first:pt-0 last:pb-0">
                        <SlotRow slot={slot} label={withYear(slot)} helpers={helpers[slot.key]} />
                        {next ? (
                          <div className="mt-1 border-l-2 border-primary/40 pl-3">
                            <SlotRow slot={next} label={withYear(next)} helpers={nextHelpers[next.key]} />
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
              </CardContent>
            </Card>
          ))}
        </div>
        <section className="flex flex-col gap-4" aria-labelledby="parents-meeting">
          <div>
            <h2 id="parents-meeting" className="font-heading text-lg font-semibold">
              {t("choirPositions.parents")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("choirPositions.parentsDescription")}</p>
          </div>
          <Card>
            <CardContent className="flex flex-col gap-3">
              {secretary ? (
                <SlotRow
                  slot={secretary}
                  label={withYear(secretary)}
                  managedAt={{ href: `${ROUTES.adminBoard}?year=${currentYear}`, label: t("board.setHere") }}
                />
              ) : null}
              <div className="grid gap-x-8 gap-y-3 border-t pt-3 md:grid-cols-3">
                {choirs.map((choir) => (
                  <div key={choir.id}>
                    {parents
                      .filter((slot) => slot.section && slot.choir?.id === choir.id)
                      .map((slot) => (
                        <SlotRow key={slot.key} slot={slot} label={slot.section?.name} />
                      ))}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
    </PeopleProvider>
  )
}

export async function ChoirPositionsScreenSkeleton() {
  const t = await getTranslations("OrgAdmin.choirPositions")
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8" aria-busy="true">
      <PageBreadcrumb route="adminChoirPositions" />
      <h1 className="font-heading text-2xl font-semibold">{t("title")}</h1>
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-80 rounded-4xl" />
        ))}
      </div>
    </main>
  )
}
