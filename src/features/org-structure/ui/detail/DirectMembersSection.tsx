"use client"

import { useTranslations } from "@/core/i18n/translations"
import { VOICE_DIVISIONS } from "@/features/voice/model"
import { InputField, SelectField } from "@/shared/forms/fields"
import { Badge } from "@/shared/ui/base/badge"
import { Button } from "@/shared/ui/base/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { GROUP_POLICIES, organisationYearPeriod } from "../../model"
import { shiftDate } from "../../model/dates"
import { CommandDialog } from "../command-dialog"
import {
  addDirectMemberAction,
  changeDirectMemberAction,
  correctDirectMemberAction,
  endDirectMemberAction
} from "./direct-actions"
import type { GroupDetail } from "./query"

type Membership = GroupDetail["directMemberships"][number]

/** Shows every direct period, including prepared and historical records, with explicit correction actions. */
export function DirectMembersSection({ detail, today }: { detail: GroupDetail; today: string }) {
  const t = useTranslations("Groups")
  const policy = GROUP_POLICIES[detail.group.type]
  const needsYear = policy.lifetime === "annual" && detail.group.organisationYear === null
  const allowed = policy.directMembership !== "no"
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <CardTitle>{t("management.directMembers")}</CardTitle>
        {allowed && !needsYear && detail.group.active ? (
          <CommandDialog
            trigger={
              <Button type="button">
                {t(policy.directMembership === "helpers" ? "management.helper" : "management.add")}
              </Button>
            }
            title={t("management.add")}
            action={addDirectMemberAction}
            submitLabel={t("management.add")}
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
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {needsYear ? <p className="text-sm text-muted-foreground">{t("errors.annual-group-needs-year")}</p> : null}
        {!allowed ? <p className="text-sm text-muted-foreground">{t("management.appointmentOnly")}</p> : null}
        {detail.directMemberships.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("management.noDirect")}</p>
        ) : null}
        {detail.directMemberships.map((member) => (
          <div
            key={member.id}
            className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-0"
          >
            <div>
              <p className="font-medium">{member.name}</p>
              <p className="text-xs text-muted-foreground">
                {t("management.period", {
                  start: member.startDate,
                  end: member.endDate ? shiftDate(member.endDate, -1) : t("management.continuing")
                })}
              </p>
              {member.voice ? <Badge variant="outline">{member.voice}</Badge> : null}
              <Badge variant="secondary">
                {t(
                  `management.${member.startDate > today ? "future" : member.endDate !== null && member.endDate <= today ? "completed" : "current"}`
                )}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-1">
              <EditDirectMemberDialog detail={detail} member={member} today={today} />
              {detail.group.active ? (
                <EditDirectMemberDialog detail={detail} member={member} today={today} change />
              ) : null}
              <CommandDialog
                trigger={
                  <Button type="button" variant="ghost" size="sm">
                    {t("management.end")}
                  </Button>
                }
                title={t("management.end")}
                action={endDirectMemberAction}
                submitLabel={t("management.end")}
              >
                <input type="hidden" name="membershipId" value={member.id} />
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
        ))}
      </CardContent>
    </Card>
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
  const isSection = detail.group.type === "Section"
  return (
    <>
      {isSection ? (
        <>
          <SelectField
            label={t("management.section")}
            name="groupId"
            defaultValue={detail.group.id}
            required
            options={detail.placementSections.map((section) => ({ value: section.id, label: section.name }))}
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
