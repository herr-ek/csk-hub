"use client"

import { useTranslations } from "@/core/i18n/translations"
import { InputField, SelectField } from "@/shared/forms/fields"
import { Button } from "@/shared/ui/base/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/ui/base/collapsible"
import { FieldDescription } from "@/shared/ui/base/field"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/base/table"
import { CommandDialog } from "../command-dialog"
import { addMemberAction, changeVoiceAction, endMembershipAction } from "./actions"
import type { GroupDetail } from "./query"

type Member = GroupDetail["members"][number]

export function MembersSection({ detail, today }: { detail: GroupDetail; today: string }) {
  const t = useTranslations("Groups.detail")
  const { group } = detail
  const isSection = group.type === "Section"

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <CardTitle>{t("membersTitle", { count: detail.members.length })}</CardTitle>
        {group.active ? <AddMemberDialog detail={detail} today={today} /> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {detail.members.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noMembers")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("member")}</TableHead>
                {isSection ? <TableHead>{t("voice")}</TableHead> : null}
                <TableHead>{t("since")}</TableHead>
                <TableHead>{t("positions")}</TableHead>
                <TableHead className="sr-only">{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.members.map((member) => (
                <TableRow key={member.userId}>
                  <TableCell>
                    <div className="font-medium">{member.name}</div>
                    <div className="text-xs text-muted-foreground">{member.email}</div>
                  </TableCell>
                  {isSection ? <TableCell>{member.voice}</TableCell> : null}
                  <TableCell>{member.startDate}</TableCell>
                  <TableCell>{member.positions.join(", ")}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-1">
                      {isSection && group.active ? (
                        <ChangeVoiceDialog detail={detail} member={member} today={today} />
                      ) : null}
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
                    <TableHead>{t("member")}</TableHead>
                    {isSection ? <TableHead>{t("voice")}</TableHead> : null}
                    <TableHead>{t("period")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.pastMembers.map((past) => (
                    <TableRow key={`${past.userId}-${past.startDate}`}>
                      <TableCell>{past.name}</TableCell>
                      {isSection ? <TableCell>{past.voice}</TableCell> : null}
                      <TableCell>{t("periodValue", { start: past.startDate, end: past.endDate })}</TableCell>
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
      description={group.choir ? t("choirMembershipNotice", { choir: group.choir.name }) : undefined}
      action={addMemberAction}
      submitLabel={t("addMember")}
    >
      <input type="hidden" name="groupId" value={group.id} />
      {detail.candidates.length === 0 ? (
        <FieldDescription>{t("noCandidates")}</FieldDescription>
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
