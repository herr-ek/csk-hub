"use client"

import { useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { Badge } from "@/shared/ui/base/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/base/card"
import type { GroupType } from "../../model"
import { GroupList, ShowArchivedToggle } from "../group-list"
import type { GroupSummary } from "../group-summaries"
import type { GroupsOverview as Overview } from "./query"

/** The groups beside the Choirs' Sections: each Choir's own groups, and the CSK-wide groups by type. */
export function GroupsOverview({ overview }: { overview: Overview }) {
  const t = useTranslations("Groups")
  const types = useTranslations("Groups.types")
  const [showArchived, setShowArchived] = useState(false)
  const visible = (groups: GroupSummary[]) => groups.filter(({ active }) => showArchived || active)

  const cskWide = visible(overview.cskWide)
  const cskWideTypes = [...new Set(cskWide.map(({ type }) => type))]
  const choirs = overview.choirs.filter(({ choir }) => showArchived || choir.active)

  return (
    <section className="flex flex-col gap-6">
      <ShowArchivedToggle checked={showArchived} onChange={setShowArchived} />

      <div className="grid gap-4 lg:grid-cols-3">
        {choirs.map(({ choir, groups }) => (
          <Card key={choir.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {choir.name}
                {choir.active ? null : <Badge variant="secondary">{t("archived")}</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <GroupList title={t("choirGroups")} groups={visible(groups)} />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("cskWide")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cskWideTypes.length === 0 ? <p className="text-sm text-muted-foreground">{t("noGroups")}</p> : null}
          {cskWideTypes.map((type) => (
            <GroupList
              key={type}
              title={types(type as GroupType)}
              groups={cskWide.filter((group) => group.type === type)}
            />
          ))}
        </CardContent>
      </Card>
    </section>
  )
}
