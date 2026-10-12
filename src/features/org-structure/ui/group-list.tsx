"use client"

import Link from "next/link"
import { useId } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { Badge } from "@/shared/ui/base/badge"
import { Label } from "@/shared/ui/base/label"
import { Switch } from "@/shared/ui/base/switch"
import { groupDetailPath } from "./command-state"
import type { GroupSummary } from "./group-summaries"

/** The switch both overviews use to include archived groups. */
export function ShowArchivedToggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  const t = useTranslations("Groups")
  const toggleId = useId()
  return (
    <div className="flex items-center gap-2 self-end">
      <Switch id={toggleId} checked={checked} onCheckedChange={onChange} />
      <Label htmlFor={toggleId}>{t("showArchived")}</Label>
    </div>
  )
}

export function GroupList({ title, groups }: { title: string; groups: GroupSummary[] }) {
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

export function GroupLink({ group }: { group: GroupSummary }) {
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
export function GroupFacts({ group }: { group: GroupSummary }) {
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
