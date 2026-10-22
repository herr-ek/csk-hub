import Link from "next/link"
import { useTranslations } from "@/core/i18n/translations"
import { GROUP_POLICIES, positionCodeKey } from "@/core/org-structure"
import { Badge } from "@/shared/ui/base/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/ui/base/collapsible"
import { Separator } from "@/shared/ui/base/separator"
import { EXPAND_TRIGGER, ExpandChevron } from "../group-list"
import { AddMemberDialog, DirectMembershipRow } from "./DirectMembershipControls"
import type { GroupDetail } from "./query"

/** One roster, separating explicit participation controls from appointment-derived Memberships. */
export function MembersSection({ detail, today }: { detail: GroupDetail; today: string }) {
  const t = useTranslations("Groups")
  const policy = GROUP_POLICIES[detail.group.type]
  const needsYear = policy.lifetime === "annual" && detail.group.organisationYear === null
  const current = detail.directMemberships.filter(
    ({ startDate, endDate }) => startDate <= today && (endDate === null || endDate > today)
  )
  const directUsers = new Set(current.map(({ userId }) => userId))
  const appointed = detail.effectiveMembers.filter(({ userId }) => !directUsers.has(userId))
  const future = detail.directMemberships.filter(({ startDate }) => startDate > today)
  const history = detail.directMemberships.filter(({ endDate }) => endDate !== null && endDate <= today)
  const positionsOf = (userId: string) =>
    detail.appointments.filter(
      (appointment) =>
        appointment.userId === userId &&
        appointment.startDate <= today &&
        (appointment.endDate === null || appointment.endDate > today)
    )

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <CardTitle>{t("detail.membersTitle", { count: detail.effectiveMembers.length })}</CardTitle>
        {policy.directMembership !== "no" && !needsYear && detail.group.active ? (
          <AddMemberDialog detail={detail} today={today} />
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {needsYear ? <p className="text-sm text-muted-foreground">{t("errors.annual-group-needs-year")}</p> : null}
        {detail.effectiveMembers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("detail.noMembers")}</p>
        ) : null}
        {current.length > 0 ? (
          <div className="flex flex-col gap-3">
            {current.map((member) => (
              <DirectMembershipRow key={member.id} detail={detail} member={member} today={today}>
                <PositionTags positions={positionsOf(member.userId)} groupId={detail.group.id} />
              </DirectMembershipRow>
            ))}
          </div>
        ) : null}
        {current.length > 0 && appointed.length > 0 ? <Separator /> : null}
        {appointed.length > 0 ? (
          <ul className="divide-y">
            {appointed.map((member) => (
              <li key={member.userId} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <p className="font-medium">{member.name}</p>
                <PositionTags positions={positionsOf(member.userId)} groupId={detail.group.id} />
              </li>
            ))}
          </ul>
        ) : null}
        {future.length > 0 ? (
          <Collapsible defaultOpen={detail.effectiveMembers.length === 0} className="flex flex-col gap-3">
            <CollapsibleTrigger className={EXPAND_TRIGGER}>
              {t("detail.futureMemberships", { count: future.length })}
              <ExpandChevron />
            </CollapsibleTrigger>
            <CollapsibleContent className="flex flex-col gap-3">
              {future.map((member) => (
                <DirectMembershipRow key={member.id} detail={detail} member={member} today={today} />
              ))}
            </CollapsibleContent>
          </Collapsible>
        ) : null}
        {history.length > 0 ? (
          <Collapsible
            defaultOpen={detail.effectiveMembers.length === 0 && future.length === 0}
            className="flex flex-col gap-3"
          >
            <CollapsibleTrigger className={EXPAND_TRIGGER}>
              {t("detail.historyToggle", { count: history.length })}
              <ExpandChevron />
            </CollapsibleTrigger>
            <CollapsibleContent className="flex flex-col gap-3">
              {history.map((member) => (
                <DirectMembershipRow key={member.id} detail={detail} member={member} today={today} />
              ))}
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </CardContent>
    </Card>
  )
}

function PositionTags({ positions, groupId }: { positions: GroupDetail["appointments"]; groupId: string }) {
  const t = useTranslations("Groups.detail")
  const labels = useTranslations("Groups.positionLabels")
  if (positions.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {positions.map((position) => (
        <Badge
          key={position.id}
          variant="secondary"
          className="h-auto max-w-full whitespace-normal py-1"
          render={<Link href={`/admin/org-structure/${position.contextGroupId}`} />}
        >
          {position.contextGroupId === groupId
            ? labels(positionCodeKey(position.positionCode))
            : t("positionWithContext", {
                position: labels(positionCodeKey(position.positionCode)),
                context: position.contextName
              })}
        </Badge>
      ))}
    </div>
  )
}
