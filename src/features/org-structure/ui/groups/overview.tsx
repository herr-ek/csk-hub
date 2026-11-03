"use client"

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { groupTypeKey } from "@/core/org-structure"
import { Button } from "@/shared/ui/base/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/ui/base/collapsible"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/base/tabs"
import { EXPAND_TRIGGER, ExpandChevron, GroupItems, GroupList } from "../group-list"
import type { GroupSummary } from "../group-summaries"
import { archivedOrganisationYears, type GroupView, groupsForView } from "./group-view"
import type { GroupsOverview as Overview } from "./query"

/** The groups beside the Choirs' Sections: each Choir's own groups, and the CSK-wide groups by type. */
export function GroupsOverview({ overview }: { overview: Overview }) {
  const t = useTranslations("Groups")
  const [view, setView] = useState<GroupView>("current")
  const years = archivedOrganisationYears(overview)
  const [archiveYear, setArchiveYear] = useState<number | undefined>(years[0])
  const selectedYear = archiveYear !== undefined && years.includes(archiveYear) ? archiveYear : years[0]
  const yearIndex = selectedYear === undefined ? -1 : years.indexOf(selectedYear)
  const undated = groupsForView(overview, "archived", null)
  const hasUndated = undated.cskWide.length > 0 || undated.choirs.length > 0

  return (
    <Tabs value={view} onValueChange={(value) => setView(value as GroupView)} className="gap-6">
      <TabsList aria-label={t("groupsPage.viewLabel")}>
        <TabsTrigger value="current">{t("management.current")}</TabsTrigger>
        <TabsTrigger value="future">{t("management.future")}</TabsTrigger>
        <TabsTrigger value="archived">{t("archived")}</TabsTrigger>
      </TabsList>
      <TabsContent value={view} className="flex flex-col gap-6">
        {view === "archived" ? (
          <>
            {selectedYear !== undefined ? (
              <>
                <div className="flex items-center gap-3 self-start" role="group" aria-label={t("management.year")}>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={t("groupsPage.previousYear")}
                    disabled={yearIndex >= years.length - 1}
                    onClick={() => setArchiveYear(years[yearIndex + 1])}
                  >
                    <ChevronLeftIcon aria-hidden="true" />
                  </Button>
                  <span className="min-w-16 text-center font-medium tabular-nums" aria-live="polite">
                    {t("management.yearValue", {
                      start: String(selectedYear).slice(-2),
                      end: String(selectedYear + 1).slice(-2)
                    })}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={t("groupsPage.nextYear")}
                    disabled={yearIndex <= 0}
                    onClick={() => setArchiveYear(years[yearIndex - 1])}
                  >
                    <ChevronRightIcon aria-hidden="true" />
                  </Button>
                </div>
                <OverviewGroups overview={groupsForView(overview, view, selectedYear)} />
              </>
            ) : null}
            {hasUndated ? (
              <section className="flex flex-col gap-4" aria-labelledby="undated-archives">
                <div>
                  <h2 id="undated-archives" className="font-heading text-lg font-semibold">
                    {t("groupsPage.undatedArchives")}
                  </h2>
                  <p className="text-sm text-muted-foreground">{t("groupsPage.undatedArchivesDescription")}</p>
                </div>
                <OverviewGroups overview={undated} />
              </section>
            ) : null}
            {selectedYear === undefined && !hasUndated ? (
              <p className="text-sm text-muted-foreground">{t("noGroups")}</p>
            ) : null}
          </>
        ) : (
          <OverviewGroups overview={groupsForView(overview, view)} />
        )}
      </TabsContent>
    </Tabs>
  )
}

function OverviewGroups({ overview }: { overview: Overview }) {
  const t = useTranslations("Groups")
  const types = useTranslations("Groups.types")
  const { cskWide, choirs } = overview
  const cskWideTypes = [...new Set(cskWide.map(({ type }) => type))]
  return (
    <>
      {choirs.length > 0 ? (
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
      ) : null}

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
    </>
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
