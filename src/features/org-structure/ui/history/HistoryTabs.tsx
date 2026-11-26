"use client"

import Link from "next/link"
import { type ReactNode, useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { GROUP_POLICIES, type IsoDate, positionCodeKey, shiftDate } from "@/core/org-structure"
import { Badge } from "@/shared/ui/base/badge"
import { Input } from "@/shared/ui/base/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/base/tabs"
import { type TenureStatus, tenureStatus, yearLabel, yearPhase } from "../../roster"
import { groupHistoryPath } from "../command-state"
import { usePeople } from "../PeopleContext"
import { useShortDate } from "../positions/SlotRow"
import { CorrectMembershipDialog, RecordMembershipDialog } from "./MembershipDialogs"
import type { GroupHistory } from "./query"
import { CorrectTenureDialog, RecordTenureDialog } from "./TenureDialogs"

/** A Group's Positions and members over time, each record open to correction. */
export function HistoryTabs({ history }: { history: GroupHistory }) {
  const t = useTranslations("OrgAdmin.history")
  const hasPositions = history.positionCodes.length > 0 || history.granted.length > 0
  const hasMembers = GROUP_POLICIES[history.group.type].directMembership !== "no"
  if (!hasMembers) return <Positions history={history} />
  if (!hasPositions) return <Members history={history} />
  return (
    <Tabs defaultValue="positions" className="gap-6">
      <TabsList aria-label={t("view")}>
        <TabsTrigger value="positions">{t("positions")}</TabsTrigger>
        <TabsTrigger value="members">{t("members")}</TabsTrigger>
      </TabsList>
      <TabsContent value="positions">
        <Positions history={history} />
      </TabsContent>
      <TabsContent value="members">
        <Members history={history} />
      </TabsContent>
    </Tabs>
  )
}

function Positions({ history }: { history: GroupHistory }) {
  const t = useTranslations("OrgAdmin.history")
  const labels = useTranslations("Groups.positionLabels")
  const { today } = usePeople()
  const { group, appointments, granted, positionCodes } = history
  // An archived Group keeps its finished tenures correctable, and takes no new ones.
  const correctable = (endDate: IsoDate | null) => group.active || (endDate !== null && endDate <= today)
  return (
    <div className="flex flex-col gap-6">
      {positionCodes.length > 0 && group.active ? (
        <div className="flex justify-end">
          <RecordTenureDialog history={history} />
        </div>
      ) : null}
      <div className="grid items-start gap-4 empty:hidden lg:grid-cols-2">
        {positionCodes.map((code) => {
          const tenures = appointments.filter(({ positionCode }) => positionCode === code)
          return (
            <section key={code} className="flex flex-col gap-1 rounded-2xl border p-4">
              <h2 className="font-medium">{labels(positionCodeKey(code))}</h2>
              {tenures.length === 0 ? <Nothing>{t("noHolders")}</Nothing> : null}
              <ul className="divide-y">
                {tenures.map((tenure) => (
                  <HistoryRecord
                    key={tenure.id}
                    userId={tenure.userId}
                    name={tenure.name}
                    period={tenure}
                    note={
                      group.organisationYear === null && tenure.organisationYear !== null
                        ? yearLabel(tenure.organisationYear)
                        : undefined
                    }
                    action={
                      correctable(tenure.endDate) ? <CorrectTenureDialog history={history} tenure={tenure} /> : null
                    }
                  />
                ))}
              </ul>
            </section>
          )
        })}
      </div>
      {granted.length > 0 ? (
        <section className="flex flex-col gap-1 rounded-2xl border p-4">
          <h2 className="font-medium">{t("granted")}</h2>
          <p className="text-sm text-muted-foreground">{t("grantedDescription")}</p>
          <ul className="divide-y">
            {granted.map((tenure) => (
              <HistoryRecord
                key={tenure.id}
                userId={tenure.userId}
                name={tenure.name}
                period={tenure}
                note={labels(positionCodeKey(tenure.positionCode))}
                action={
                  <Link
                    href={groupHistoryPath(tenure.contextGroupId)}
                    className="shrink-0 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                  >
                    {tenure.contextName}
                  </Link>
                }
              />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

const STATUSES: TenureStatus[] = ["ended", "current", "planned"]

function Members({ history }: { history: GroupHistory }) {
  const t = useTranslations("OrgAdmin.history")
  const { today } = usePeople()
  const { group, memberships } = history
  const byStatus = (status: TenureStatus) => memberships.filter((row) => tenureStatus(row, today) === status)
  const [status, setStatus] = useState<TenureStatus>(byStatus("ended").length > 0 ? "ended" : "current")
  const [search, setSearch] = useState("")
  const shown = byStatus(status)
    .filter(({ name }) => name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => b.startDate.localeCompare(a.startDate) || a.name.localeCompare(b.name, "sv"))
  const addable =
    group.active && (group.organisationYear === null || yearPhase(group.organisationYear, today) !== "planned")

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={status} onValueChange={(next) => setStatus(next as TenureStatus)}>
          <TabsList aria-label={t("period")}>
            {STATUSES.map((option) => (
              <TabsTrigger key={option} value={option}>
                {t(`status.${option}`, { count: byStatus(option).length })}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("search")}
          aria-label={t("search")}
          className="w-full sm:w-56"
        />
        {addable ? (
          <div className="sm:ml-auto">
            <RecordMembershipDialog history={history} />
          </div>
        ) : null}
      </div>
      {shown.length === 0 ? (
        <p className="rounded-2xl border px-4 py-3 text-sm text-muted-foreground">{t("noMembers")}</p>
      ) : (
        <ul className="divide-y rounded-2xl border px-4">
          {shown.map((membership) => (
            <HistoryRecord
              key={membership.id}
              userId={membership.userId}
              name={membership.name}
              period={membership}
              note={membership.voice ?? membership.voiceFamily ?? undefined}
              hideStatus
              action={
                group.active || status === "ended" ? (
                  <CorrectMembershipDialog history={history} membership={membership} />
                ) : null
              }
            />
          ))}
        </ul>
      )}
    </div>
  )
}

/** One person's period, with when it was and the way to correct it. */
function HistoryRecord({
  userId,
  name,
  period,
  note,
  hideStatus = false,
  action
}: {
  userId: string
  name: string
  period: { startDate: IsoDate; endDate: IsoDate | null }
  note?: string
  hideStatus?: boolean
  action: ReactNode
}) {
  const t = useTranslations("OrgAdmin.history")
  const { people, today } = usePeople()
  const date = useShortDate()
  const status = tenureStatus(period, today)
  const active = people.some(({ id }) => id === userId)
  return (
    <li className="flex min-h-14 items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2">
          {active ? (
            <Link
              href={`/members/${encodeURIComponent(userId)}`}
              className="font-medium underline-offset-4 hover:underline"
            >
              {name}
            </Link>
          ) : (
            <span className="font-medium">{name}</span>
          )}
          {note ? <Badge variant="outline">{note}</Badge> : null}
          {hideStatus || status === "ended" ? null : <Badge variant="secondary">{t(`badge.${status}`)}</Badge>}
        </p>
        <p className="text-sm text-muted-foreground">
          {period.endDate
            ? t("range", { start: date(period.startDate), end: date(shiftDate(period.endDate, -1)) })
            : t("since", { start: date(period.startDate) })}
        </p>
      </div>
      {action}
    </li>
  )
}

function Nothing({ children }: { children: ReactNode }) {
  return <p className="py-2 text-sm text-muted-foreground">{children}</p>
}
