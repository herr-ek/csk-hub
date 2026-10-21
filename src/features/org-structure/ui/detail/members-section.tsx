"use client"

import { useTranslations } from "@/core/i18n/translations"
import { compareVoices, type Voice } from "@/features/voice/model"
import { InputField, SelectField } from "@/shared/forms/fields"
import { Button } from "@/shared/ui/base/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/ui/base/collapsible"
import { FieldDescription } from "@/shared/ui/base/field"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/base/table"
import { GROUP_POLICIES } from "../../model"
import { CommandDialog } from "../command-dialog"
import { SortableHead, useSortedRows } from "../sortable-table"
import { addMemberAction, changeVoiceAction, endMembershipAction } from "./actions"
import { LegacyCorrectionDialog } from "./DirectMembersSection"
import type { GroupDetail } from "./query"

type Member = GroupDetail["members"][number]
type PastMember = GroupDetail["pastMembers"][number]

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "sv")
const byVoice = (a: { voice: Voice | null }, b: { voice: Voice | null }) =>
  compareVoices(a.voice as Voice, b.voice as Voice)

// Every column breaks ties by name. A member with no Voice or no Position sorts last.
const MEMBER_ORDER = {
  member: byName,
  voice: (a: Member, b: Member) => byVoice(a, b) || byName(a, b),
  since: (a: Member, b: Member) => a.startDate.localeCompare(b.startDate) || byName(a, b),
  positions: (a: Member, b: Member) =>
    a.positions.join(", ").localeCompare(b.positions.join(", "), "sv") || byName(a, b)
}
const MEMBER_MISSING = {
  voice: (member: Member) => member.voice === null,
  positions: (member: Member) => member.positions.length === 0
}

const PAST_MEMBER_ORDER = {
  member: byName,
  voice: (a: PastMember, b: PastMember) => byVoice(a, b) || byName(a, b),
  period: (a: PastMember, b: PastMember) =>
    a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate) || byName(a, b)
}
const PAST_MEMBER_MISSING = { voice: (past: PastMember) => past.voice === null }

export function MembersSection({ detail, today }: { detail: GroupDetail; today: string }) {
  const t = useTranslations("Groups.detail")
  const { group } = detail
  const isSection = group.type === "Section"
  // A Section shows the Voice each member sings in it; a Choir the Voice from their Section.
  const showsVoice = isSection || group.type === "Choir"
  const members = useSortedRows(detail.members, MEMBER_ORDER, "member", MEMBER_MISSING)
  const pastMembers = useSortedRows(detail.pastMembers, PAST_MEMBER_ORDER, "member", PAST_MEMBER_MISSING)

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <CardTitle>{t("membersTitle", { count: detail.members.length })}</CardTitle>
        {group.active &&
        GROUP_POLICIES[group.type].directMembership !== "no" &&
        (GROUP_POLICIES[group.type].lifetime !== "annual" || group.organisationYear !== null) ? (
          <AddMemberDialog detail={detail} today={today} />
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {detail.members.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noMembers")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead column="member" sort={members.sort} onSort={members.sortBy}>
                  {t("member")}
                </SortableHead>
                {showsVoice ? (
                  <SortableHead column="voice" sort={members.sort} onSort={members.sortBy}>
                    {t("voice")}
                  </SortableHead>
                ) : null}
                <SortableHead column="since" sort={members.sort} onSort={members.sortBy}>
                  {t("since")}
                </SortableHead>
                <SortableHead column="positions" sort={members.sort} onSort={members.sortBy}>
                  {t("positions")}
                </SortableHead>
                <TableHead className="sr-only">{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.sorted.map((member) => (
                <TableRow key={member.userId}>
                  <TableCell>
                    <div className="font-medium">{member.name}</div>
                    <div className="text-xs text-muted-foreground">{member.email}</div>
                  </TableCell>
                  {showsVoice ? <TableCell>{member.voice}</TableCell> : null}
                  <TableCell>{member.startDate}</TableCell>
                  <TableCell>{member.positions.join(", ")}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-1">
                      {isSection && group.active ? (
                        <ChangeVoiceDialog detail={detail} member={member} today={today} />
                      ) : null}
                      {detail.legacyMemberships
                        .filter((row) => row.userId === member.userId && row.startDate === member.startDate)
                        .map((row) => (
                          <LegacyCorrectionDialog key={row.startDate} detail={detail} member={row} today={today} />
                        ))}
                      <EndMembershipDialog detail={detail} member={member} today={today} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Collapsible>
          <CollapsibleTrigger render={<Button type="button" variant="ghost" size="sm" />}>
            {t("historyToggle", { count: detail.pastMembers.length })}
          </CollapsibleTrigger>
          <CollapsibleContent>
            {detail.pastMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noHistory")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHead column="member" sort={pastMembers.sort} onSort={pastMembers.sortBy}>
                      {t("member")}
                    </SortableHead>
                    {isSection ? (
                      <SortableHead column="voice" sort={pastMembers.sort} onSort={pastMembers.sortBy}>
                        {t("voice")}
                      </SortableHead>
                    ) : null}
                    <SortableHead column="period" sort={pastMembers.sort} onSort={pastMembers.sortBy}>
                      {t("period")}
                    </SortableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pastMembers.sorted.map((past) => (
                    <TableRow key={`${past.userId}-${past.startDate}`}>
                      <TableCell>{past.name}</TableCell>
                      {isSection ? <TableCell>{past.voice}</TableCell> : null}
                      <TableCell>
                        {t("periodValue", { start: past.startDate, end: past.endDate })}
                        {detail.legacyMemberships
                          .filter((row) => row.userId === past.userId && row.startDate === past.startDate)
                          .map((row) => (
                            <LegacyCorrectionDialog key={row.startDate} detail={detail} member={row} today={today} />
                          ))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}

function AddMemberDialog({ detail, today }: { detail: GroupDetail; today: string }) {
  const t = useTranslations("Groups.detail")
  const { group } = detail
  const isSection = group.type === "Section"

  return (
    <CommandDialog
      trigger={<Button type="button">{t("addMember")}</Button>}
      title={t("addMemberTitle", { name: group.name })}
      description={
        group.choir
          ? t(isSection ? "choirMembershipNotice" : "choirMembersOnly", { choir: group.choir.name })
          : undefined
      }
      action={addMemberAction}
      submitLabel={t("addMember")}
    >
      <input type="hidden" name="groupId" value={group.id} />
      {detail.candidates.length === 0 ? (
        <FieldDescription>
          {group.choir && !isSection ? t("noChoirCandidates", { choir: group.choir.name }) : t("noCandidates")}
        </FieldDescription>
      ) : (
        <SelectField
          label={t("member")}
          name="userId"
          required
          options={detail.candidates.map((candidate) => ({
            value: candidate.id,
            label: t("userOption", { name: candidate.name, email: candidate.email })
          }))}
        />
      )}
      {isSection ? (
        <SelectField
          label={t("voice")}
          name="voice"
          required
          options={detail.sectionVoices.map((voice) => ({ value: voice, label: voice }))}
        />
      ) : null}
      <InputField label={t("startDate")} name="startDate" defaultValue={today} type="date" required />
    </CommandDialog>
  )
}

function EndMembershipDialog({ detail, member, today }: { detail: GroupDetail; member: Member; today: string }) {
  const t = useTranslations("Groups.detail")
  const { group } = detail

  return (
    <CommandDialog
      trigger={
        <Button type="button" variant="ghost" size="sm">
          {t("endMembership")}
        </Button>
      }
      title={t("endMembershipTitle", { name: member.name, group: group.name })}
      description={
        <>
          <span className="block">
            {member.positions.length > 0
              ? t("endsPositions", { positions: member.positions.join(", ") })
              : t("endsNoPositions")}
          </span>
          {group.type === "Choir" ? <span className="block">{t("endsChoirGroups", { choir: group.name })}</span> : null}
        </>
      }
      action={endMembershipAction}
      submitLabel={t("endMembership")}
      destructive
    >
      <input type="hidden" name="groupId" value={group.id} />
      <input type="hidden" name="userId" value={member.userId} />
      <InputField label={t("endDate")} name="endDate" defaultValue={today} type="date" required />
    </CommandDialog>
  )
}

function ChangeVoiceDialog({ detail, member, today }: { detail: GroupDetail; member: Member; today: string }) {
  const t = useTranslations("Groups.detail")
  // The Section's own Voices first, so the default keeps the singer in their Section.
  const others = detail.choirVoices.filter((voice) => voice !== member.voice)
  const voices = [
    ...others.filter((voice) => detail.sectionVoices.includes(voice)),
    ...others.filter((voice) => !detail.sectionVoices.includes(voice))
  ]

  return (
    <CommandDialog
      trigger={
        <Button type="button" variant="ghost" size="sm">
          {t("changeVoice")}
        </Button>
      }
      title={t("changeVoiceTitle", { name: member.name })}
      description={t("changeVoiceDescription")}
      action={changeVoiceAction}
      submitLabel={t("changeVoice")}
    >
      <input type="hidden" name="groupId" value={detail.group.id} />
      <input type="hidden" name="userId" value={member.userId} />
      <SelectField
        label={t("voice")}
        name="voice"
        required
        options={voices.map((voice) => ({ value: voice, label: voice }))}
      />
      <InputField label={t("changeDate")} name="date" defaultValue={today} type="date" required />
    </CommandDialog>
  )
}
