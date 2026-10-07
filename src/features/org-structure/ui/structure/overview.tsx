"use client"

import Link from "next/link"
import { useId, useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { Badge } from "@/shared/ui/base/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Label } from "@/shared/ui/base/label"
import { Switch } from "@/shared/ui/base/switch"
import type { GroupType } from "../../model"
import { groupDetailPath } from "../command-state"
import type { GroupStructure, GroupSummary } from "./query"

/** The whole CSK structure: CSK-wide groups by type, and each Choir one level deep. */
export function StructureOverview({ structure }: { structure: GroupStructure }) {
  const t = useTranslations("Groups")
  const types = useTranslations("Groups.types")
  const toggleId = useId()
  const [showArchived, setShowArchived] = useState(false)
  const visible = (groups: GroupSummary[]) => groups.filter(({ active }) => showArchived || active)

  const cskWide = visible(structure.cskWide)
  const cskWideTypes = [...new Set(cskWide.map(({ type }) => type))]
  const choirs = structure.choirs.filter(({ choir }) => showArchived || choir.active)

  return (
    <section className="flex flex-col gap-6" aria-labelledby="structure-heading">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id="structure-heading" className="font-heading text-lg font-semibold">
          {t("structure")}
        </h2>
        <div className="flex items-center gap-2">
          <Switch id={toggleId} checked={showArchived} onCheckedChange={setShowArchived} />
          <Label htmlFor={toggleId}>{t("showArchived")}</Label>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {choirs.map(({ choir, sections, groups }) => (
          <Card key={choir.id}>
            <CardHeader>
              <CardTitle>
                <GroupLink group={choir} />
              </CardTitle>
              <GroupFacts group={choir} />
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <GroupList title={t("sections")} groups={visible(sections)} />
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

function GroupList({ title, groups }: { title: string; groups: GroupSummary[] }) {
  const t = useTranslations("Groups")
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noGroups")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {groups.map((group) => (
            <li key={group.id} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <GroupLink group={group} />
                {group.voices.map((voice) => (
                  <Badge key={voice} variant="outline">
                    {voice}
                  </Badge>
                ))}
              </div>
              <GroupFacts group={group} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function GroupLink({ group }: { group: GroupSummary }) {
  const t = useTranslations("Groups")
  return (
    <span className="inline-flex items-center gap-2">
      <Link href={groupDetailPath(group.id)} className="font-medium underline-offset-4 hover:underline">
        {group.name}
      </Link>
      {group.active ? null : <Badge variant="secondary">{t("archived")}</Badge>}
    </span>
  )
}

/** Member count and current Position holders, inline. */
function GroupFacts({ group }: { group: GroupSummary }) {
  const t = useTranslations("Groups")
  return (
    <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
      <span>{t("memberCount", { count: group.memberCount })}</span>
      {group.holders.map(({ position, holder }) => (
        <span key={position}>{t("holderInline", { position, holder })}</span>
      ))}
    </p>
  )
}
