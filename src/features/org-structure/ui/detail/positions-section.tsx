"use client"

import { useTranslations } from "@/core/i18n/translations"
import { InputField, SelectField } from "@/shared/forms/fields"
import { Button } from "@/shared/ui/base/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/ui/base/collapsible"
import { FieldDescription } from "@/shared/ui/base/field"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/base/table"
import { CommandDialog } from "../command-dialog"
import { assignHolderAction, endHoldingAction } from "./actions"
import type { GroupDetail } from "./query"

type GroupPosition = GroupDetail["positions"][number]

export function PositionsSection({ detail, today }: { detail: GroupDetail; today: string }) {
  const t = useTranslations("Groups.detail")

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("positionsTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {detail.positions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noPositions")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("position")}</TableHead>
                <TableHead>{t("holder")}</TableHead>
                <TableHead className="sr-only">{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.positions.map((position) => (
                <TableRow key={position.id}>
                  <TableCell className="font-medium">{position.name}</TableCell>
                  <TableCell>
                    {position.holder ? (
                      t("holderSince", { name: position.holder.name, since: position.holder.startDate })
                    ) : (
                      <span className="text-muted-foreground">{t("vacant")}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {detail.group.active ? (
                      <div className="flex flex-wrap justify-end gap-1">
                        <AssignHolderDialog detail={detail} position={position} today={today} />
                        {position.holder ? (
                          <EndHoldingDialog detail={detail} position={position} today={today} />
                        ) : null}
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Collapsible>
          <CollapsibleTrigger render={<Button type="button" variant="ghost" size="sm" />}>
            {t("holderHistoryToggle", { count: detail.pastHolders.length })}
          </CollapsibleTrigger>
          <CollapsibleContent>
            {detail.pastHolders.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noHistory")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("position")}</TableHead>
                    <TableHead>{t("holder")}</TableHead>
                    <TableHead>{t("period")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.pastHolders.map((past) => (
                    <TableRow key={`${past.position}-${past.name}-${past.startDate}`}>
                      <TableCell>{past.position}</TableCell>
                      <TableCell>{past.name}</TableCell>
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

/** Only current members can hold a Position; a current holder hands over on the start date. */
function AssignHolderDialog({
  detail,
  position,
  today
}: {
  detail: GroupDetail
  position: GroupPosition
  today: string
}) {
  const t = useTranslations("Groups.detail")
  const candidates = detail.members.filter(({ userId }) => userId !== position.holder?.userId)

  return (
    <CommandDialog
      trigger={
        <Button type="button" variant="ghost" size="sm">
          {position.holder ? t("replaceHolder") : t("assignHolder")}
        </Button>
      }
      title={t("assignTitle", { position: position.name, group: detail.group.name })}
      description={position.holder ? t("replaceNotice", { name: position.holder.name }) : undefined}
      action={assignHolderAction}
      submitLabel={position.holder ? t("replaceHolder") : t("assignHolder")}
    >
      <input type="hidden" name="groupId" value={detail.group.id} />
      <input type="hidden" name="positionId" value={position.id} />
      {candidates.length === 0 ? (
        <FieldDescription>{t("noHolderCandidates")}</FieldDescription>
      ) : (
        <SelectField
          label={t("holder")}
          name="userId"
          required
          options={candidates.map((member) => ({ value: member.userId, label: member.name }))}
        />
      )}
      <InputField label={t("startDate")} name="startDate" defaultValue={today} type="date" required />
    </CommandDialog>
  )
}

function EndHoldingDialog({
  detail,
  position,
  today
}: {
  detail: GroupDetail
  position: GroupPosition
  today: string
}) {
  const t = useTranslations("Groups.detail")
  if (!position.holder) return null

  return (
    <CommandDialog
      trigger={
        <Button type="button" variant="ghost" size="sm">
          {t("endHolding")}
        </Button>
      }
      title={t("endHoldingTitle", { name: position.holder.name, position: position.name })}
      description={t("endHoldingDescription")}
      action={endHoldingAction}
      submitLabel={t("endHolding")}
      destructive
    >
      <input type="hidden" name="groupId" value={detail.group.id} />
      <input type="hidden" name="positionId" value={position.id} />
      <input type="hidden" name="userId" value={position.holder.userId} />
      <InputField label={t("endDate")} name="endDate" defaultValue={today} type="date" required />
    </CommandDialog>
  )
}
