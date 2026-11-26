import { ChevronLeftIcon, PlusIcon } from "lucide-react"
import Link from "next/link"
import { getTranslations } from "@/core/i18n/server"
import { PageBreadcrumb } from "@/core/navigation/PageBreadcrumb"
import { ROUTES } from "@/core/navigation/site"
import { GROUP_POLICIES, GroupType, groupTypeKey, positionCodeKey } from "@/core/org-structure"
import { Badge } from "@/shared/ui/base/badge"
import { Button } from "@/shared/ui/base/button"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { cn } from "@/shared/utils"
import { yearLabel, yearPhase } from "../../roster"
import { committeePath } from "../command-state"
import { HistoryLink } from "../HistoryLink"
import { PeopleProvider } from "../PeopleContext"
import { SlotRow } from "../positions/SlotRow"
import { loadCommittees } from "../queries"
import { YearBanner, YearStepper } from "../YearStepper"
import { ChoirCoverage, RecruitmentRoster, Roster } from "./CommitteeRoster"
import { CreateOtherGroupDialog, GroupNameActions } from "./GroupNameDialogs"
import { AddMembersDialog } from "./MemberDialogs"

type LoadedCommittee = Awaited<ReturnType<typeof loadCommittees>>["committees"][number]

/**
 * Every committee of a year beside the roster of one. On a narrow screen it is either the list or,
 * once a committee is asked for, its roster.
 */
export async function CommitteesScreen({
  requestedCommittee,
  requestedYear
}: {
  requestedCommittee?: string
  requestedYear?: string
}) {
  const [data, t, types, labels] = await Promise.all([
    loadCommittees(requestedYear),
    getTranslations("OrgAdmin"),
    getTranslations("Groups.types"),
    getTranslations("Groups.positionLabels")
  ])
  const { committees, choirs, helpers, people, today, year, years, setUp } = data
  const selected = committees.find(({ key }) => key === requestedCommittee) ?? committees[0]
  if (!selected) return null
  const nameOf = (committee: LoadedCommittee) => committee.name ?? types(groupTypeKey(committee.type))
  const annual = selected.organisationYear !== null
  const editable = annual ? yearPhase(year, today) !== "ended" : selected.groupId !== null
  const recruitment = selected.type === GroupType.RecruitmentCommittee
  const hasHelpers = GROUP_POLICIES[selected.type].directMembership === "helpers"

  const item = (committee: LoadedCommittee) => {
    const { vacant, families, choirs: missing } = committee.gaps
    const gaps = [
      ...(vacant > 0 ? [t("committees.vacant", { count: vacant })] : []),
      ...[...families, ...missing].map((name) => t("committees.missing", { name }))
    ]
    return (
      <li key={committee.key}>
        <Link
          href={committeePath(committee.key, year)}
          aria-current={committee.key === selected.key ? "page" : undefined}
          className="flex flex-col rounded-xl px-3 py-2 text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring md:aria-[current=page]:bg-muted md:aria-[current=page]:font-medium"
        >
          {nameOf(committee)}
          {gaps.length > 0 && yearPhase(year, today) !== "ended" ? (
            <span className="text-xs font-normal text-muted-foreground">{gaps.join(", ")}</span>
          ) : null}
        </Link>
      </li>
    )
  }

  return (
    <PeopleProvider people={people} today={today}>
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <PageBreadcrumb route="adminCommittees" />
        <h1 className={cn("font-heading text-2xl font-semibold", requestedCommittee && "max-md:hidden")}>
          {t("committees.title")}
        </h1>
        <div className="grid gap-6 md:grid-cols-[15rem_1fr]">
          <nav
            aria-label={t("committees.title")}
            className={cn("flex flex-col gap-4 md:border-r md:pr-4", requestedCommittee && "max-md:hidden")}
          >
            <div>
              <p className="px-3 pb-1 text-xs font-medium text-muted-foreground">{yearLabel(year)}</p>
              <ul>{committees.filter(({ organisationYear }) => organisationYear !== null).map(item)}</ul>
            </div>
            <div>
              <p className="px-3 pb-1 text-xs font-medium text-muted-foreground">{t("committees.ongoing")}</p>
              <ul>{committees.filter(({ organisationYear }) => organisationYear === null).map(item)}</ul>
            </div>
            <CreateOtherGroupDialog
              trigger={
                <Button type="button" variant="ghost" size="sm" className="self-start">
                  <PlusIcon aria-hidden="true" />
                  {t("committees.create")}
                </Button>
              }
            />
          </nav>
          <div className={cn("flex min-w-0 flex-col gap-5", !requestedCommittee && "max-md:hidden")}>
            <Link
              href={`${ROUTES.adminCommittees}?year=${year}`}
              className="flex items-center gap-1 text-sm text-muted-foreground md:hidden"
            >
              <ChevronLeftIcon className="size-4" aria-hidden="true" />
              {t("committees.all")}
            </Link>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="font-heading text-xl font-semibold">{nameOf(selected)}</h2>
              <div className="flex flex-wrap items-center gap-2">
                {selected.type === GroupType.Other && selected.groupId ? (
                  <GroupNameActions groupId={selected.groupId} name={nameOf(selected)} />
                ) : null}
                {selected.groupId ? <HistoryLink groupId={selected.groupId} /> : null}
                {annual ? (
                  <YearStepper
                    year={year}
                    years={years}
                    today={today}
                    href={(target) => committeePath(selected.key, target)}
                  />
                ) : (
                  <Badge variant="outline">{t("committees.ongoing")}</Badge>
                )}
              </div>
            </div>
            {annual ? <YearBanner year={year} today={today} setUp={setUp} /> : null}
            {selected.slots.length > 0 ? (
              <section
                aria-label={t("committees.positions")}
                className="flex flex-col divide-y rounded-2xl border px-4 *:py-1"
              >
                {selected.slots.map((slot) => {
                  const managedAt =
                    slot.contextType === GroupType.Board
                      ? { href: `${ROUTES.adminBoard}?year=${year}`, label: t("board.setHere") }
                      : slot.contextType === GroupType.Choir
                        ? { href: ROUTES.adminChoirPositions, label: t("choirPositions.setHere") }
                        : undefined
                  return (
                    <SlotRow
                      key={slot.key}
                      slot={slot}
                      helpers={helpers[slot.key]}
                      managedAt={managedAt}
                      label={
                        slot.choir
                          ? t("positions.inContext", {
                              position: labels(positionCodeKey(slot.positionCode)),
                              context: slot.choir.name
                            })
                          : undefined
                      }
                    />
                  )
                })}
              </section>
            ) : null}
            {recruitment ? (
              <RecruitmentRoster
                committee={selected}
                name={nameOf(selected)}
                slots={selected.slots}
                editable={editable}
              />
            ) : (
              <>
                {selected.type === GroupType.NominationCommittee ? (
                  <ChoirCoverage choirs={choirs} members={selected.members} />
                ) : null}
                <section className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-medium">
                      {t(hasHelpers ? "committees.helperCount" : "committees.memberCount", {
                        count: selected.members.length
                      })}
                    </h3>
                    {editable ? (
                      <AddMembersDialog committee={selected} name={nameOf(selected)} slots={selected.slots} />
                    ) : null}
                  </div>
                  <Roster
                    members={selected.members}
                    name={nameOf(selected)}
                    editable={editable}
                    showChoirs={selected.type === GroupType.NominationCommittee}
                  />
                </section>
              </>
            )}
          </div>
        </div>
      </main>
    </PeopleProvider>
  )
}

export async function CommitteesScreenSkeleton() {
  const t = await getTranslations("OrgAdmin.committees")
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8" aria-busy="true">
      <PageBreadcrumb route="adminCommittees" />
      <h1 className="font-heading text-2xl font-semibold">{t("title")}</h1>
      <div className="grid gap-6 md:grid-cols-[15rem_1fr]">
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl max-md:hidden" />
      </div>
    </main>
  )
}
