import { getFormatter, getTranslations } from "@/core/i18n/server"
import { useTranslations } from "@/core/i18n/translations"
import { Badge } from "@/shared/ui/base/badge"
import { Card, CardContent, CardHeader } from "@/shared/ui/base/card"
import type { ProfileAffiliations } from "./affiliations"

type Group = ProfileAffiliations["groups"][number]

function Positions({ positions }: { positions: Group["positions"] }) {
  const label = useTranslations("Groups.positionLabels")
  return positions.length ? (
    <div className="flex flex-wrap gap-2">
      {positions.map((position) => (
        <Badge key={position.id} variant="secondary">
          {position.positionCode ? label(position.positionCode) : position.name}
        </Badge>
      ))}
    </div>
  ) : null
}

async function GroupList({ groups, showContext = false }: { groups: Group[]; showContext?: boolean }) {
  const t = await getTranslations("MemberProfiles")
  return (
    <ul className="divide-y">
      {groups.map((group) => (
        <li key={group.groupId} className="flex flex-wrap items-center justify-between gap-2 py-3">
          <span className="font-medium">
            {showContext && group.choirName
              ? t("groupContext", { group: group.name, choir: group.choirName })
              : group.name}
          </span>
          <Positions positions={group.positions} />
        </li>
      ))}
    </ul>
  )
}

export function MemberGroupsCard({ groups, showContext = false }: { groups: Group[]; showContext?: boolean }) {
  return (
    <Card>
      <CardContent>
        <GroupList groups={groups} showContext={showContext} />
      </CardContent>
    </Card>
  )
}

/** Keeps Choir tenure, Section Voice and the singer's assignment distinct. */
export async function ChoirCard({ choir }: { choir: ProfileAffiliations["choirs"][number] }) {
  const [t, format] = await Promise.all([getTranslations("MemberProfiles"), getFormatter()])
  return (
    <Card className="border-t-4 border-primary/40">
      <CardHeader>
        <h3 className="font-heading text-xl font-semibold">{choir.name}</h3>
        <p className="text-sm text-muted-foreground">
          {t("memberSince", {
            date: format.dateTime(new Date(`${choir.startDate}T12:00:00Z`), {
              month: "long",
              year: "numeric",
              timeZone: "UTC"
            })
          })}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Positions positions={choir.positions} />
        {choir.section ? (
          <div className="rounded-2xl bg-primary/5 p-4">
            <p className="mb-2 text-xs text-muted-foreground">{t("section")}</p>
            <p className="font-medium">{choir.section.name}</p>
            {choir.section.sectionVoice && choir.section.sectionVoice !== choir.section.voice ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {t("sectionVoice", { voice: choir.section.sectionVoice })}
              </p>
            ) : null}
            {choir.section.voice ? (
              <p className="mt-1 text-sm text-muted-foreground">{t("assignedVoice", { voice: choir.section.voice })}</p>
            ) : null}
            {choir.section.positions.length ? (
              <div className="mt-2">
                <Positions positions={choir.section.positions} />
              </div>
            ) : null}
          </div>
        ) : null}
        {choir.groups.length ? <GroupList groups={choir.groups} /> : null}
      </CardContent>
    </Card>
  )
}
