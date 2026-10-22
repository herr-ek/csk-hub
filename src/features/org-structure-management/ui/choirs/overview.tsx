"use client"

import { useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { GroupFacts, GroupLink, GroupList, ShowArchivedToggle } from "../group-list"
import type { GroupSummary } from "../group-summaries"
import type { ChoirPlacement } from "./query"

/** Each Choir with its Sections, where singers are placed and change Voice. */
export function ChoirsOverview({ placement }: { placement: ChoirPlacement }) {
  const t = useTranslations("Groups")
  const [showArchived, setShowArchived] = useState(false)
  const visible = (groups: GroupSummary[]) => groups.filter(({ active }) => showArchived || active)
  const choirs = placement.filter(({ choir }) => showArchived || choir.active)

  return (
    <section className="flex flex-col gap-6">
      <ShowArchivedToggle checked={showArchived} onChange={setShowArchived} />

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
