"use client"

import { UserMinusIcon } from "lucide-react"
import { type ReactElement, useState } from "react"
import { useFormatter, useTranslations } from "@/core/i18n/translations"
import {
  type GroupType,
  groupTypeKey,
  organisationYearPeriod,
  PositionCode,
  positionCodeKey,
  shiftDate
} from "@/core/org-structure"
import { DateField } from "@/shared/forms/fields"
import { Button } from "@/shared/ui/base/button"
import { defaultStart, holdersByStatus, yearLabel } from "../../roster"
import type { Person, PositionSlot, SlotHolder } from "../../roster-reads"
import { DatesField } from "../DatesField"
import { GroupCommandDialog } from "../group-command-dialog"
import { usePeople } from "../PeopleContext"
import { PersonPicker } from "../PersonPicker"
import { fillPositionAction, vacatePositionAction } from "./actions"

/** Names a Position together with the Choir, Section and year it is held in. */
export function usePositionName() {
  const t = useTranslations("OrgAdmin.positions")
  const labels = useTranslations("Groups.positionLabels")
  return (slot: PositionSlot) => {
    const position = labels(positionCodeKey(slot.positionCode))
    const context = slot.section?.name ?? slot.choir?.name
    const name = context ? t("inContext", { position, context }) : position
    return slot.organisationYear === null ? name : t("inYear", { name, year: yearLabel(slot.organisationYear) })
  }
}

/** Those who can take a Position: a Choir's or Section's own members, and anyone for the rest. */
function candidates(slot: PositionSlot, people: Person[]) {
  if (slot.positionCode === PositionCode.Conductor) return people
  if (slot.section)
    return people.filter(({ placements }) => placements.some((own) => own.sectionId === slot.section?.id))
  if (slot.choir) return people.filter(({ choirs }) => choirs.some(({ id }) => id === slot.choir?.id))
  return people
}

/** Asks who takes a Position, replacing whoever holds it or is planned to. */
export function FillPositionDialog({
  slot,
  trigger,
  helpers = [],
  only
}: {
  slot: PositionSlot
  trigger: ReactElement
  helpers?: { userId: string; type: GroupType }[]
  /** Limits the candidates to these Users, as a gig group's members. */
  only?: string[]
}) {
  const t = useTranslations("OrgAdmin.positions")
  const format = useFormatter()
  const positionName = usePositionName()
  const { today } = usePeople()
  const { current, planned } = holdersByStatus(slot.holders, today)
  const start = defaultStart(slot.organisationYear, today)
  const replaced = current ?? (start > today ? planned[0] : undefined)
  const bounds = slot.organisationYear === null ? null : organisationYearPeriod(slot.organisationYear)
  const longDate = (date: string) => format.dateTime(new Date(`${date}T12:00:00Z`), { dateStyle: "long" })

  return (
    <GroupCommandDialog
      trigger={trigger}
      title={positionName(slot)}
      description={
        start > today
          ? t("planDescription", { date: longDate(start) })
          : replaced
            ? t("replaceDescription", { name: replaced.name })
            : t("appointDescription")
      }
      action={fillPositionAction}
      submitLabel={start > today ? t("plan") : replaced ? t("replace") : t("appoint")}
    >
      <input type="hidden" name="positionCode" value={slot.positionCode} />
      {slot.contextGroupId ? <input type="hidden" name="contextGroupId" value={slot.contextGroupId} /> : null}
      {slot.organisationYear === null ? null : (
        <input type="hidden" name="organisationYear" value={slot.organisationYear} />
      )}
      {replaced ? <input type="hidden" name="replaces" value={replaced.appointmentId} /> : null}
      <CandidateField slot={slot} helpers={helpers} only={only} replacedId={replaced?.userId} />
      <DatesField start={start} min={bounds?.startDate} max={bounds ? shiftDate(bounds.endDate, -1) : undefined} />
    </GroupCommandDialog>
  )
}

/** The candidates, and what else happens to the one picked. Mounted with its dialog, so each opening starts afresh. */
function CandidateField({
  slot,
  helpers,
  only,
  replacedId
}: {
  slot: PositionSlot
  helpers: { userId: string; type: GroupType }[]
  only?: string[]
  replacedId?: string
}) {
  const t = useTranslations("OrgAdmin.positions")
  const types = useTranslations("Groups.types")
  const { people } = usePeople()
  const [pickedId, setPickedId] = useState<string>()
  const options = candidates(slot, people).filter(({ id }) => id !== replacedId && (!only || only.includes(id)))
  const picked = people.find(({ id }) => id === pickedId)
  const joinsChoir =
    slot.positionCode === PositionCode.Conductor && picked && !picked.choirs.some(({ id }) => id === slot.choir?.id)
  return (
    <>
      <PersonPicker label={t("person")} name="userId" people={options} onPick={([userId]) => setPickedId(userId)} />
      {helpers
        .filter(({ userId }) => userId === pickedId)
        .map(({ type }) => (
          <Notice key={type}>
            {t("endsHelper", { name: picked?.name ?? "", committee: types(groupTypeKey(type)) })}
          </Notice>
        ))}
      {joinsChoir ? <Notice>{t("joinsChoir", { name: picked.name, choir: slot.choir?.name ?? "" })}</Notice> : null}
    </>
  )
}

/** Leaves a Position vacant, or clears a plan that has not begun. */
export function VacatePositionDialog({ slot, holder }: { slot: PositionSlot; holder: SlotHolder }) {
  const t = useTranslations("OrgAdmin.positions")
  const positionName = usePositionName()
  const { today } = usePeople()
  const notBegun = holder.startDate >= today
  return (
    <GroupCommandDialog
      trigger={
        <Button type="button" variant="ghost" size="icon-sm" aria-label={notBegun ? t("clearPlan") : t("leaveVacant")}>
          <UserMinusIcon aria-hidden="true" />
        </Button>
      }
      title={t(notBegun ? "clearPlanTitle" : "leaveVacantTitle", { name: holder.name, position: positionName(slot) })}
      action={vacatePositionAction}
      submitLabel={notBegun ? t("clearPlan") : t("leaveVacant")}
      destructive
    >
      <input type="hidden" name="appointmentId" value={holder.appointmentId} />
      {notBegun ? null : (
        <DateField
          label={t("lastDay")}
          name="lastDay"
          defaultValue={today}
          min={holder.startDate}
          max={holder.endDate ? shiftDate(holder.endDate, -1) : undefined}
          required
        />
      )}
    </GroupCommandDialog>
  )
}

export function Notice({ children }: { children: string }) {
  return (
    <p role="status" className="rounded-2xl bg-muted px-4 py-3 text-sm">
      {children}
    </p>
  )
}
