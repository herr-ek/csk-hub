"use client"

import type { ReactNode } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { GroupType, organisationYearPeriod, shiftDate } from "@/core/org-structure"
import { VOICE_DIVISIONS } from "@/features/voice/model"
import { InputField, SelectField } from "@/shared/forms/fields"
import { Badge } from "@/shared/ui/base/badge"
import { Button } from "@/shared/ui/base/button"
import { CommandDialog } from "../command-dialog"
import {
  addDirectMemberAction,
  changeDirectMemberAction,
  correctDirectMemberAction,
  endChoirMemberAction,
  endDirectMemberAction
} from "./direct-actions"
import type { GroupDetail } from "./query"

type Membership = GroupDetail["directMemberships"][number]

export function AddMemberDialog({ detail, today }: { detail: GroupDetail; today: string }) {
  const t = useTranslations("Groups")
  return (
    <CommandDialog
      trigger={<Button type="button">{t("detail.addMember")}</Button>}
      title={t("detail.addMember")}
      action={addDirectMemberAction}
      submitLabel={t("detail.addMember")}
    >
      <SelectField
        label={t("detail.member")}
        name="userId"
        required
        options={detail.directCandidates.map((candidate) => ({
          value: candidate.id,
          label: t("detail.userOption", candidate)
        }))}
      />
      <MembershipFields detail={detail} today={today} />
    </CommandDialog>
  )
}

/** Controls operate on one explicit period; appointment-derived members use their appointment workflow. */
export function DirectMembershipRow({
  detail,
  member,
  today,
  children
}: {
  detail: GroupDetail
  member: Membership
  today: string
  children?: ReactNode
}) {
  const t = useTranslations("Groups")
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-0">
      <div className="flex flex-col gap-1">
        <p className="font-medium">{member.name}</p>
        {children}
        <p className="text-xs text-muted-foreground">
          {t("management.period", {
            start: member.startDate,
            end: member.endDate ? shiftDate(member.endDate, -1) : t("management.continuing")
          })}
        </p>
        {member.voice ? (
          <Badge className="self-start" variant="outline">
            {member.voice}
          </Badge>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1">
        <EditDirectMemberDialog detail={detail} member={member} today={today} />
        {detail.group.active && detail.group.type === GroupType.Section ? (
          <EditDirectMemberDialog detail={detail} member={member} today={today} change />
        ) : null}
        <CommandDialog
          trigger={
            <Button type="button" variant="ghost" size="sm">
              {t("management.end")}
            </Button>
          }
          title={t("management.end")}
          action={detail.group.type === GroupType.Choir ? endChoirMemberAction : endDirectMemberAction}
          submitLabel={t("management.end")}
        >
          {detail.group.type === GroupType.Choir ? (
            <>
              <input type="hidden" name="membershipId" value={member.id} />
              <input type="hidden" name="groupId" value={detail.group.id} />
              <input type="hidden" name="userId" value={member.userId} />
            </>
          ) : (
            <input type="hidden" name="membershipId" value={member.id} />
          )}
          <InputField
            label={t("management.lastDay")}
            name="lastDay"
            type="date"
            required
            min={member.startDate}
            max={member.endDate ? shiftDate(member.endDate, -1) : undefined}
            defaultValue={member.endDate ? shiftDate(member.endDate, -1) : today}
          />
        </CommandDialog>
      </div>
    </div>
  )
}

function EditDirectMemberDialog({
  detail,
  member,
  today,
  change = false
}: {
  detail: GroupDetail
  member: Membership
  today: string
  change?: boolean
}) {
  const t = useTranslations("Groups.management")
  return (
    <CommandDialog
      trigger={
        <Button type="button" variant="ghost" size="sm">
          {t(change ? "change" : "correct")}
        </Button>
      }
      title={t(change ? "change" : "correct")}
      description={t(change ? "changeDescription" : "correctDescription")}
      action={change ? changeDirectMemberAction : correctDirectMemberAction}
      submitLabel={t("save")}
    >
      <input type="hidden" name="membershipId" value={member.id} />
      <MembershipFields detail={detail} today={today} member={member} change={change} />
    </CommandDialog>
  )
}

function MembershipFields({
  detail,
  today,
  member,
  change = false
}: {
  detail: GroupDetail
  today: string
  member?: Membership
  change?: boolean
}) {
  const t = useTranslations("Groups")
  const year = detail.group.organisationYear
  const bounds = year === null ? null : organisationYearPeriod(year)
  const start = member && !change ? member.startDate : bounds && today < bounds.startDate ? bounds.startDate : today
  const lastDay = member
    ? member.endDate
      ? shiftDate(member.endDate, -1)
      : ""
    : bounds
      ? shiftDate(bounds.endDate, -1)
      : ""
  const isSection = detail.group.type === GroupType.Section
  return (
    <>
      {isSection ? (
        <>
          <SelectField
            label={t("management.section")}
            name="groupId"
            defaultValue={detail.group.id}
            required
            options={detail.placementSections
              .filter(
                (section) =>
                  section.active ||
                  (!change && member?.endDate !== null && member?.endDate !== undefined && member.endDate <= today)
              )
              .map((section) => ({ value: section.id, label: section.name }))}
          />
          <SelectField
            label={t("management.voice")}
            name="voice"
            required
            defaultValue={member?.voice ?? detail.sectionVoices[0]}
            options={VOICE_DIVISIONS.map((voice) => ({ value: voice, label: voice }))}
          />
        </>
      ) : (
        <input type="hidden" name="groupId" value={detail.group.id} />
      )}
      <InputField
        label={t(change ? "management.effectiveDate" : "detail.startDate")}
        name="startDate"
        type="date"
        required
        defaultValue={start}
        min={bounds?.startDate}
        max={bounds ? shiftDate(bounds.endDate, -1) : undefined}
      />
      <InputField
        label={t("management.lastDay")}
        description={t("management.noLastDay")}
        name="lastDay"
        type="date"
        defaultValue={lastDay}
        required={bounds !== null}
        min={bounds?.startDate}
        max={bounds ? shiftDate(bounds.endDate, -1) : undefined}
      />
    </>
  )
}
