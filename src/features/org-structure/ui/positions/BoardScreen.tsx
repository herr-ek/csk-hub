import Link from "next/link"
import { getTranslations } from "@/core/i18n/server"
import { PageBreadcrumb } from "@/core/navigation/PageBreadcrumb"
import { ROUTES } from "@/core/navigation/site"
import { COMMITTEE_TYPES, groupTypeKey } from "@/core/org-structure"
import { Card, CardContent } from "@/shared/ui/base/card"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { isVacant, yearPhase } from "../../roster"
import { slotsGranting } from "../../roster-reads"
import { committeePath } from "../command-state"
import { HistoryLink } from "../HistoryLink"
import { PeopleProvider } from "../PeopleContext"
import { loadBoard } from "../queries"
import { YearBanner, YearStepper } from "../YearStepper"
import { SlotRow } from "./SlotRow"

/** The Board: its offices and who holds them, one Organisational year at a time. */
export async function BoardScreen({ requestedYear }: { requestedYear?: string }) {
  const [{ slots, helpers, people, today, year, years, setUp }, t, types] = await Promise.all([
    loadBoard(requestedYear),
    getTranslations("OrgAdmin"),
    getTranslations("Groups.types")
  ])
  const vacant = slots.filter((slot) => isVacant(slot, today)).length
  const groupId = slots[0]?.contextGroupId
  return (
    <PeopleProvider people={people} today={today}>
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <PageBreadcrumb route="adminBoard" />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-semibold">{t("board.title")}</h1>
            {yearPhase(year, today) === "ended" ? null : (
              <p className="mt-1 text-sm text-muted-foreground">{t("board.vacancies", { count: vacant })}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {groupId ? <HistoryLink groupId={groupId} /> : null}
            <YearStepper
              year={year}
              years={years}
              today={today}
              href={(target) => `${ROUTES.adminBoard}?year=${target}`}
            />
          </div>
        </div>
        <YearBanner year={year} today={today} setUp={setUp} />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {slots.map((slot) => {
            const committee = COMMITTEE_TYPES.find((type) => slotsGranting([slot], type).length > 0)
            return (
              <Card key={slot.key}>
                <CardContent className="flex flex-col gap-2">
                  <SlotRow slot={slot} helpers={helpers[slot.key]} />
                  {committee ? (
                    <Link
                      href={committeePath(committee, year)}
                      className="self-start text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                    >
                      {t("board.alsoIn", { committee: types(groupTypeKey(committee)) })}
                    </Link>
                  ) : null}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </main>
    </PeopleProvider>
  )
}

export async function BoardScreenSkeleton() {
  const t = await getTranslations("OrgAdmin.board")
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8" aria-busy="true">
      <PageBreadcrumb route="adminBoard" />
      <h1 className="font-heading text-2xl font-semibold">{t("title")}</h1>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-28 rounded-4xl" />
        ))}
      </div>
    </main>
  )
}
