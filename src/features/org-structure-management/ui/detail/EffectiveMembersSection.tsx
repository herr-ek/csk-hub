import Link from "next/link"
import { useTranslations } from "@/core/i18n/translations"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/base/card"
import type { GroupDetail } from "./query"

export function EffectiveMembersSection({ detail }: { detail: GroupDetail }) {
  const t = useTranslations("Groups.detail")
  const positionLabel = useTranslations("Groups.positionLabels")

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("membersTitle", { count: detail.effectiveMembers.length })}</CardTitle>
      </CardHeader>
      <CardContent>
        {detail.effectiveMembers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noMembers")}</p>
        ) : (
          <ul className="divide-y">
            {detail.effectiveMembers.map((member) => (
              <li key={member.userId} className="py-3 first:pt-0 last:pb-0">
                <p className="font-medium">{member.name}</p>
                {member.positions.length > 0 ? (
                  <ul className="text-sm text-muted-foreground">
                    {member.positions.map((appointment) => (
                      <li key={appointment.id}>
                        <Link
                          className="underline underline-offset-2"
                          href={`/admin/org-structure/${appointment.contextGroupId}`}
                        >
                          {t("positionWithContext", {
                            position: positionLabel(appointment.positionCode),
                            context: appointment.contextName
                          })}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
