"use client"

import { useTranslations } from "@/core/i18n/translations"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { GroupFacts, GroupLink, GroupList } from "../group-list"
import type { GroupSummary } from "../group-summaries"
import type { ChoirPlacement } from "./query"

/** Each Choir with its Sections, where singers are placed and change Voice. */
export function ChoirsOverview({ placement }: { placement: ChoirPlacement }) {
  const t = useTranslations("Groups")
  const visible = (groups: GroupSummary[]) => groups.filter(({ active }) => active)
  const choirs = placement.filter(({ choir }) => choir.active)

  return (
    <section className="flex flex-col gap-6">
      {choirs.length === 0 ? <p className="text-sm text-muted-foreground">{t("choirsPage.noChoirs")}</p> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        {choirs.map(({ choir, sections }) => (
          <Card key={choir.id}>
            <CardHeader>
              <CardTitle>
                <GroupLink group={choir} />
              </CardTitle>
              <GroupFacts group={choir} />
            </CardHeader>
            <CardContent>
              <GroupList title={t("sections")} groups={visible(sections)} />
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
