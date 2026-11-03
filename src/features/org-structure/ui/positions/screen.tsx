import Link from "next/link"
import { db } from "@/core/db"
import { getFormatter, getTranslations } from "@/core/i18n/server"
import { PageBreadcrumb } from "@/core/navigation/PageBreadcrumb"
import { GroupType, positionCodeKey, shiftDate } from "@/core/org-structure"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { cskToday } from "../../effective-reads"
import { listPositionHistoryYears, listPositionOverview, type PositionOverview } from "../../position-overview"
import { listLocalizedGroupLabels } from "../group-labels"
import { PositionPeriodPicker } from "./PositionPeriodPicker"

export async function PositionsScreen({ requestedYear }: { requestedYear?: string }) {
  const today = cskToday()
  const [years, labels, t, positions, format] = await Promise.all([
    listPositionHistoryYears(db, today),
    listLocalizedGroupLabels(),
    getTranslations("PositionsPage"),
    getTranslations("Groups.positionLabels"),
    getFormatter()
  ])
  const parsed = requestedYear ? Number(requestedYear) : undefined
  const year = parsed !== undefined && years.includes(parsed) ? parsed : undefined
  const contexts = await listPositionOverview(db, today, year)
  const label = (context: PositionOverview[number]) =>
    labels.get(context.group.id) ?? context.group.name ?? context.group.type
  const sorted = contexts.sort(
    (a, b) =>
      Number(b.group.type === GroupType.Board) - Number(a.group.type === GroupType.Board) ||
      label(a).localeCompare(label(b))
  )
  const categories = [
    {
      key: "csk",
      title: t("csk"),
      contexts: sorted.filter(
        ({ group }) =>
          group.type !== GroupType.Choir && group.type !== GroupType.Section && group.type !== GroupType.GigGroup
      )
    },
    { key: "choirs", title: t("choirs"), contexts: sorted.filter(({ group }) => group.type === GroupType.Choir) },
    { key: "sections", title: t("sections"), contexts: sorted.filter(({ group }) => group.type === GroupType.Section) },
    { key: "gigs", title: t("gigs"), contexts: sorted.filter(({ group }) => group.type === GroupType.GigGroup) }
  ]
  const holders = (position: PositionOverview[number]["positions"][number]) => (
    <ul className="flex flex-col gap-2">
      {position.holders.map((holder) => (
        <li key={holder.userId}>
          <Link
            href={`/members/${encodeURIComponent(holder.userId)}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {holder.name}
          </Link>
          {holder.periods.map((period) => (
            <p key={period.id} className="text-xs text-muted-foreground">
              {t("tenure", {
                start: format.dateTime(new Date(`${period.startDate}T12:00:00Z`), { dateStyle: "medium" }),
                end: period.endDate
                  ? format.dateTime(new Date(`${shiftDate(period.endDate, -1)}T12:00:00Z`), { dateStyle: "medium" })
                  : t("ongoing")
              })}
            </p>
          ))}
        </li>
      ))}
    </ul>
  )
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <PageBreadcrumb route="adminPositions" />
      <div>
        <h1 className="font-heading text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <PositionPeriodPicker years={years} selectedYear={year} />
      <p className="text-sm text-muted-foreground">{year === undefined ? t("currentHelp") : t("historyHelp")}</p>
      {contexts.length === 0 ? <p className="text-muted-foreground">{t("empty")}</p> : null}
      {categories
        .filter(({ contexts }) => contexts.length > 0)
        .map((category) => (
          <section key={category.key} className="flex flex-col gap-4" aria-labelledby={`positions-${category.key}`}>
            <h2 id={`positions-${category.key}`} className="font-heading text-xl font-semibold">
              {category.title}
            </h2>
            <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
              {category.key === "sections"
                ? [...new Set(category.contexts.map(({ group }) => group.choirId))].map((choirId) => (
                    <Card key={choirId}>
                      <CardHeader>
                        <CardTitle>
                          {category.contexts.find(({ group }) => group.choirId === choirId)?.choirName}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-4">
                        {category.contexts
                          .filter(({ group }) => group.choirId === choirId)
                          .map((context) => (
                            <div key={context.group.id} className="flex flex-col gap-1">
                              <Link
                                href={`/admin/org-structure/${context.group.id}`}
                                className="text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
                              >
                                {label(context)}
                              </Link>
                              {context.positions.map((position) => (
                                <div key={position.code}>{holders(position)}</div>
                              ))}
                            </div>
                          ))}
                      </CardContent>
                    </Card>
                  ))
                : category.contexts.map((context) => (
                    <Card key={context.group.id}>
                      <CardHeader>
                        <CardTitle>
                          <Link
                            href={`/admin/org-structure/${context.group.id}`}
                            className="underline-offset-4 hover:underline"
                          >
                            {label(context)}
                          </Link>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <dl className="flex flex-col gap-4">
                          {context.positions.map((position) => (
                            <div key={position.code} className="flex flex-col gap-1">
                              <dt className="text-sm text-muted-foreground">
                                {positions(positionCodeKey(position.code))}
                              </dt>
                              <dd>{holders(position)}</dd>
                            </div>
                          ))}
                        </dl>
                      </CardContent>
                    </Card>
                  ))}
            </div>
          </section>
        ))}
    </main>
  )
}

export async function PositionsScreenSkeleton() {
  const t = await getTranslations("PositionsPage")
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8" aria-busy="true">
      <PageBreadcrumb route="adminPositions" />
      <h1 className="font-heading text-2xl font-semibold">{t("title")}</h1>
      <Skeleton className="h-12 w-64" />
      <Skeleton className="h-64" />
    </main>
  )
}
