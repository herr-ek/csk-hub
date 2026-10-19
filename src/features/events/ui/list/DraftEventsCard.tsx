import Link from "next/link"
import { isUserAdmin } from "@/core/auth/permissions.server"
import { getFormatter, getTranslations } from "@/core/i18n/server"
import { ROUTES } from "@/core/navigation/site"
import { OverviewCard, OverviewList, overviewRowClassName } from "@/shared/layouts/overview-card"
import { adminEventPath } from "../command-state"
import { listAdminEvents } from "./query"

const SHOWN = 3

/**
 * Upcoming Event Drafts waiting to be published, for an Admin's overview page. Renders nothing
 * for anyone else, or when there are none.
 */
export async function DraftEventsCard({ className }: { className?: string }) {
  if (!(await isUserAdmin())) return null
  const [drafts, t, format] = await Promise.all([
    listAdminEvents({ when: "upcoming", status: "Draft" }, new Date()),
    getTranslations("HomePage.eventDrafts"),
    getFormatter()
  ])
  if (drafts.length === 0) return null

  return (
    <OverviewCard
      title={t("title", { count: drafts.length })}
      link={{ href: `${ROUTES.adminEvents}?status=Draft`, label: t("seeAll") }}
      className={className}
    >
      <OverviewList>
        {drafts.slice(0, SHOWN).map((draft) => (
          <li key={draft.id}>
            <Link href={adminEventPath(draft.id)} className={`${overviewRowClassName} flex-col gap-0.5`}>
              <span className="font-medium break-words">{draft.title}</span>
              <time dateTime={draft.startsAt.toISOString()} className="text-sm text-muted-foreground">
                {format.dateTime(draft.startsAt, { weekday: "short", day: "numeric", month: "short" })}
              </time>
            </Link>
          </li>
        ))}
      </OverviewList>
    </OverviewCard>
  )
}
