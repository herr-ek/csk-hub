"use client"

import { useTranslations } from "@/core/i18n/translations"
import { GroupType, organisationYearPeriod, shiftDate } from "@/core/org-structure"
import { VOICE_DIVISIONS } from "@/features/voice/model"
import { DateField, SelectField } from "@/shared/forms/fields"
import { Button } from "@/shared/ui/base/button"
import { VOICE_FAMILIES } from "../../roster"
import { GroupCommandDialog } from "../group-command-dialog"
import { usePeople } from "../PeopleContext"
import { PersonPicker } from "../PersonPicker"
import { correctMembershipAction, recordMembershipAction } from "./actions"
import type { GroupHistory } from "./query"

type Membership = GroupHistory["memberships"][number]

export function RecordMembershipDialog({ history }: { history: GroupHistory }) {
  const t = useTranslations("OrgAdmin.history")
  const { people } = usePeople()
  return (
    <GroupCommandDialog
      trigger={
        <Button type="button" variant="outline" size="sm">
          {t("recordMember")}
        </Button>
      }
      title={t("recordMember")}
      description={t("recordDescription")}
      action={recordMembershipAction}
      submitLabel={t("record")}
    >
      <PersonPicker label={t("person")} people={people} name="userId" />
      <MembershipFields history={history} />
    </GroupCommandDialog>
  )
}

export function CorrectMembershipDialog({ history, membership }: { history: GroupHistory; membership: Membership }) {
  const t = useTranslations("OrgAdmin.history")
  return (
    <GroupCommandDialog
      trigger={
        <Button type="button" variant="ghost" size="sm" aria-label={t("correctFor", { name: membership.name })}>
          {t("correct")}
        </Button>
      }
      title={t("correctFor", { name: membership.name })}
      description={t("correctDescription")}
      action={correctMembershipAction}
      submitLabel={t("save")}
    >
      <input type="hidden" name="membershipId" value={membership.id} />
      <MembershipFields history={history} membership={membership} />
    </GroupCommandDialog>
  )
}

function MembershipFields({ history, membership }: { history: GroupHistory; membership?: Membership }) {
  const t = useTranslations("OrgAdmin.history")
  const { group, placementSections, sectionVoice } = history
  const bounds = group.organisationYear === null ? null : organisationYearPeriod(group.organisationYear)
  const lastDay = bounds ? shiftDate(bounds.endDate, -1) : undefined
  const singsIn = placementSections.filter(({ active, id }) => active || id === group.id || membership?.endDate)
  return (
    <>
      {group.type === GroupType.Section ? (
        <SelectField
          label={t("section")}
          name="groupId"
          defaultValue={group.id}
          required
          options={singsIn.map(({ id, name }) => ({ value: id, label: name }))}
        />
      ) : (
        <input type="hidden" name="groupId" value={group.id} />
      )}
      {group.type === GroupType.Section || group.type === GroupType.GigGroup ? (
        <SelectField
          label={t("voice")}
          name="voice"
          required
          defaultValue={membership?.voice ?? VOICE_DIVISIONS.find((voice) => voice.startsWith(sectionVoice ?? ""))}
          options={VOICE_DIVISIONS.map((voice) => ({ value: voice, label: voice }))}
        />
      ) : null}
      {group.type === GroupType.RecruitmentCommittee ? (
        <SelectField
          label={t("voice")}
          name="voiceFamily"
          required
          defaultValue={membership?.voiceFamily ?? VOICE_FAMILIES[0]}
          options={VOICE_FAMILIES.map((family) => ({ value: family, label: family }))}
        />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <DateField
          label={t("firstDay")}
          name="startDate"
          defaultValue={membership?.startDate}
          min={bounds?.startDate}
          max={lastDay}
          required
        />
        <DateField
          label={t("lastDay")}
          description={bounds ? undefined : t("lastDayHelp")}
          name="lastDay"
          defaultValue={membership?.endDate ? shiftDate(membership.endDate, -1) : lastDay}
          min={bounds?.startDate}
          max={lastDay}
          required={bounds !== null}
        />
      </div>
    </>
  )
}
