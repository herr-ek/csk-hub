"use client"

import { AlertCircleIcon, CheckIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "@/core/i18n/translations"
import { Badge } from "@/shared/ui/base/badge"
import { cn } from "@/shared/utils"
import { tenureStatus, VOICE_FAMILIES, yearPhase } from "../../roster"
import type { ChoirStructure, Committee, PositionSlot, RosterMember } from "../../roster-reads"
import { usePeople } from "../PeopleContext"
import { useShortDate } from "../positions/SlotRow"
import { AddMembersDialog, RemoveMemberDialog } from "./MemberDialogs"

/** The independent members of a Group; Position holders are listed above it. */
export function Roster({
  members,
  name,
  editable,
  showChoirs = false
}: {
  members: RosterMember[]
  name: string
  editable: boolean
  showChoirs?: boolean
}) {
  const t = useTranslations("OrgAdmin.committees")
  if (members.length === 0)
    return <p className="rounded-2xl border px-4 py-3 text-sm text-muted-foreground">{t("nobody")}</p>
  return (
    <ul className="divide-y rounded-2xl border">
      {members.map((member) => (
        <li key={member.membershipId} className="flex min-h-12 items-center gap-3 px-4 py-1">
          {showChoirs
            ? member.choirs.map(({ id, name: choir }) => (
                <Badge key={id} variant="secondary">
                  {choir}
                </Badge>
              ))
            : null}
          <MemberName member={member} />
          {editable ? <RemoveMemberDialog member={member} name={name} /> : null}
        </li>
      ))}
    </ul>
  )
}

function MemberName({ member }: { member: RosterMember }) {
  const t = useTranslations("OrgAdmin.positions")
  const { people, today } = usePeople()
  const date = useShortDate()
  const active = people.some(({ id }) => id === member.userId)
  return (
    <span className="min-w-0 flex-1">
      {active ? (
        <Link href={`/members/${encodeURIComponent(member.userId)}`} className="underline-offset-4 hover:underline">
          {member.name}
        </Link>
      ) : (
        member.name
      )}
      {tenureStatus(member, today) === "planned" ? (
        <span className="ml-2 text-xs text-muted-foreground">{t("startsOn", { date: date(member.startDate) })}</span>
      ) : null}
    </span>
  )
}

/** Whether every Choir has someone in the committee; a gap is a reminder, never a rule. */
export function ChoirCoverage({ choirs, members }: { choirs: ChoirStructure[]; members: RosterMember[] }) {
  const t = useTranslations("OrgAdmin.committees")
  return (
    <ul className="grid grid-cols-3 gap-3">
      {choirs.map((choir) => {
        const count = members.filter((member) => member.choirs.some(({ id }) => id === choir.id)).length
        return (
          <li
            key={choir.id}
            className={cn(
              "flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-4 py-3",
              count === 0 && "border-dashed border-destructive"
            )}
          >
            <span className="font-medium">{choir.name}</span>
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              {count === 0 ? (
                <AlertCircleIcon className="size-4 text-destructive" aria-hidden="true" />
              ) : (
                <CheckIcon className="size-4" aria-hidden="true" />
              )}
              {t("peopleCount", { count })}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/** Rekryteringskommittén's Helpers by the Voice family they were chosen as, vacant Voices standing out. */
export function RecruitmentRoster({
  committee,
  name,
  slots,
  editable
}: {
  committee: Committee
  name: string
  slots: PositionSlot[]
  editable: boolean
}) {
  const t = useTranslations("OrgAdmin")
  const { today } = usePeople()
  const finished = committee.organisationYear !== null && yearPhase(committee.organisationYear, today) === "ended"
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {VOICE_FAMILIES.map((family) => {
        const members = committee.members.filter(({ voiceFamily }) => voiceFamily === family)
        const vacant = members.length === 0
        return (
          <li
            key={family}
            className={cn(
              "flex min-h-32 flex-col gap-2 rounded-2xl border p-4",
              vacant && !finished && "border-dashed border-destructive"
            )}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-xl font-semibold">{family}</h3>
              {members.length > 1 ? (
                <Badge variant="outline">{t("committees.extra", { count: members.length - 1 })}</Badge>
              ) : null}
            </div>
            {vacant ? <p className="text-muted-foreground italic">{t("positions.vacant")}</p> : null}
            {members.map((member) => (
              <div key={member.membershipId} className="flex items-center justify-between gap-2">
                <MemberName member={member} />
                {editable ? <RemoveMemberDialog member={member} name={name} /> : null}
              </div>
            ))}
            {editable ? (
              <div className="mt-auto">
                <AddMembersDialog committee={committee} name={name} slots={slots} family={family} emphasised={vacant} />
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
