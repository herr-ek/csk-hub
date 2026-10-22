"use client"

import { useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { groupTypeKey } from "@/core/org-structure"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/ui/base/collapsible"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/base/tabs"
import { EXPAND_TRIGGER, ExpandChevron, GroupItems, GroupList } from "../group-list"
import type { GroupSummary } from "../group-summaries"
import { type GroupView, groupsForView } from "./group-view"
import type { GroupsOverview as Overview } from "./query"

/** The groups beside the Choirs' Sections: each Choir's own groups, and the CSK-wide groups by type. */
export function GroupsOverview({ overview }: { overview: Overview }) {
  const t = useTranslations("Groups")
  const types = useTranslations("Groups.types")
  const [view, setView] = useState<GroupView>("current")
  const { cskWide, choirs } = groupsForView(overview, view)
  const cskWideTypes = [...new Set(cskWide.map(({ type }) => type))]

  return (
    <Tabs value={view} onValueChange={(value) => setView(value as GroupView)} className="gap-6">
      <TabsList aria-label={t("groupsPage.viewLabel")}>
        <TabsTrigger value="current">{t("management.current")}</TabsTrigger>
        <TabsTrigger value="future">{t("management.future")}</TabsTrigger>
        <TabsTrigger value="archived">{t("archived")}</TabsTrigger>
      </TabsList>
      <TabsContent value={view} className="flex flex-col gap-6">
        <div className="grid gap-4 lg:grid-cols-3">
          {choirs.map(({ choir, groups }) => (
            <Card key={choir.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">{choir.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <GroupList title={t("choirGroups")} groups={groups} />
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
              <TypeGroups
                key={type}
                title={types(groupTypeKey(type))}
                groups={cskWide.filter((group) => group.type === type)}
              />
            ))}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}

/** Above this many groups, a type starts collapsed, so one type with many groups, as the gig groups, does not stretch the card. */
const COLLAPSE_ABOVE = 3

function TypeGroups({ title, groups }: { title: string; groups: GroupSummary[] }) {
  const t = useTranslations("Groups")
  if (groups.length <= COLLAPSE_ABOVE) return <GroupList title={title} groups={groups} />
  return (
    <Collapsible className="flex flex-col gap-2">
      <CollapsibleTrigger className={`${EXPAND_TRIGGER} text-sm font-medium`}>
        {t("typeWithCount", { type: title, count: groups.length })}
        <ExpandChevron />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <GroupItems groups={groups} />
      </CollapsibleContent>
    </Collapsible>
  )
}
