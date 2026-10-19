import { requireAuthenticatedUser } from "@/core/auth/session.server"
import { db } from "@/core/db"
import { getTranslations } from "@/core/i18n/server"
import { ROUTES } from "@/core/navigation/site"
import { OverviewCard } from "@/shared/layouts/overview-card"
import { Badge } from "@/shared/ui/base/badge"
import { getCurrentAffiliations } from "./service"

/**
 * Where the signed-in User sings, for an overview page: each Choir with their Section and Voice,
 * the Positions they hold, and their other groups. It shows no more than their own profile does.
 */
export async function WhereISingCard({ className }: { className?: string }) {
  const userId = await requireAuthenticatedUser()
  const [{ choirs, groups, otherGroups }, t] = await Promise.all([
    getCurrentAffiliations(db, userId),
    getTranslations("HomePage.me")
  ])
  const others = [...choirs.flatMap((choir) => choir.groups), ...groups, ...otherGroups]

  return (
    <OverviewCard title={t("title")} link={{ href: ROUTES.account, label: t("profile") }} className={className}>
      {choirs.length ? (
        <ul className="flex flex-col gap-3">
          {choirs.map((choir) => {
            const positions = [...choir.positions, ...(choir.section?.positions ?? [])]
            // DKA1 is A1 already; KKB says which of its divisions the singer sings.
            const voice = choir.section?.voice !== choir.section?.sectionVoice ? choir.section?.voice : null
            return (
              <li key={choir.groupId} className="flex flex-col gap-1.5">
                <p className="font-medium">
                  {choir.section
                    ? t(voice ? "sectionVoiceInChoir" : "sectionInChoir", {
                        section: choir.section.name,
                        voice: voice ?? "",
                        choir: choir.name
                      })
                    : choir.name}
                </p>
                {positions.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {positions.map((position) => (
                      <Badge key={`${position.groupId}:${position.positionId}`} variant="secondary">
                        {position.name}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t("noChoir")}</p>
      )}
      {others.length ? (
        <p className="text-sm text-muted-foreground">
          {t("alsoIn", { groups: others.map((group) => group.name).join(", ") })}
        </p>
      ) : null}
    </OverviewCard>
  )
}
