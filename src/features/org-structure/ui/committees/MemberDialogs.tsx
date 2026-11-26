"use client"

import { PlusIcon } from "lucide-react"
import { useTranslations } from "@/core/i18n/translations"
import { GROUP_POLICIES, organisationYearPeriod, shiftDate } from "@/core/org-structure"
import type { VoiceFamily } from "@/features/voice/model"
import { DateField } from "@/shared/forms/fields"
import { Button } from "@/shared/ui/base/button"
import { defaultStart, singsFamily } from "../../roster"
import type { Committee, PositionSlot, RosterMember } from "../../roster-reads"
import { DatesField } from "../DatesField"
import { GroupCommandDialog } from "../group-command-dialog"
import { usePeople } from "../PeopleContext"
import { PersonPicker } from "../PersonPicker"
import { addMembersAction, removeMemberAction } from "./actions"

/** Adds one or more people to a committee, as a Voice family in Rekryteringskommittén. */
export function AddMembersDialog({
  committee,
  name,
  slots,
  family,
  emphasised = false
}: {
  committee: Committee
  name: string
  /** The Positions that grant the committee; their holders cannot be Helpers too. */
  slots: PositionSlot[]
  family?: VoiceFamily
  emphasised?: boolean
}) {
  const t = useTranslations("OrgAdmin.committees")
  const { people, today } = usePeople()
  const { organisationYear: year } = committee
  const bounds = year === null ? null : organisationYearPeriod(year)
  const helpers = GROUP_POLICIES[committee.type].directMembership === "helpers"
  const taken = new Set([
    ...committee.members.map(({ userId }) => userId),
    ...(helpers ? slots.flatMap(({ holders }) => holders.map(({ userId }) => userId)) : [])
  ])
  const options = people.filter(({ id, voices }) => !taken.has(id) && (!family || singsFamily(voices, family)))
  const extra = family !== undefined && !emphasised
  const label = family
    ? t(extra ? "addExtra" : "addVoice", { voice: family })
    : t(helpers ? "addHelpers" : "addMembers")

  return (
    <GroupCommandDialog
      trigger={
        <Button
          type="button"
          size="sm"
          variant={emphasised ? "default" : extra ? "ghost" : "outline"}
          aria-label={family ? t("addVoiceTo", { voice: family, name }) : undefined}
        >
          <PlusIcon aria-hidden="true" />
          {label}
        </Button>
      }
      title={family ? t("addVoiceTo", { voice: family, name }) : t("addTo", { name })}
      description={family ? t("onlyVoice", { voice: family }) : undefined}
      action={addMembersAction}
      submitLabel={t("add")}
    >
      {year === null ? (
        <input type="hidden" name="groupId" value={committee.groupId ?? ""} />
      ) : (
        <>
          <input type="hidden" name="type" value={committee.type} />
          <input type="hidden" name="organisationYear" value={year} />
        </>
      )}
      {family ? <input type="hidden" name="voiceFamily" value={family} /> : null}
      <PersonPicker label={t("people")} people={options} name="userIds" multiple />
      <DatesField
        start={defaultStart(year, today)}
        min={bounds?.startDate}
        max={bounds ? shiftDate(bounds.endDate, -1) : undefined}
      />
    </GroupCommandDialog>
  )
}

export function RemoveMemberDialog({ member, name }: { member: RosterMember; name: string }) {
  const t = useTranslations("OrgAdmin.committees")
  const { today } = usePeople()
  const notBegun = member.startDate >= today
  return (
    <GroupCommandDialog
      trigger={
        <Button type="button" size="sm" variant="ghost" aria-label={t("removeFrom", { member: member.name, name })}>
          {t("remove")}
        </Button>
      }
      title={t("removeTitle", { member: member.name, name })}
      description={notBegun ? t("removeNotBegun") : undefined}
      action={removeMemberAction}
      submitLabel={t("remove")}
      destructive
    >
      <input type="hidden" name="membershipId" value={member.membershipId} />
      {notBegun ? null : (
        <DateField
          label={t("lastDay")}
          name="lastDay"
          defaultValue={today}
          min={member.startDate}
          max={member.endDate ? shiftDate(member.endDate, -1) : undefined}
          required
        />
      )}
    </GroupCommandDialog>
  )
}
