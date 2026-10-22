"use client"

import { ChevronDownIcon, ChevronUpIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "@/core/i18n/translations"
import { positionCodeKey } from "@/core/org-structure"
import { Badge } from "@/shared/ui/base/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/ui/base/collapsible"
import { groupDetailPath } from "./command-state"
import type { GroupSummary } from "./group-summaries"

export function GroupList({ title, groups }: { title: string; groups: GroupSummary[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      <GroupItems groups={groups} />
    </div>
  )
}

/** The groups of a list, each with its Voices, member count and Position holders. */
export function GroupItems({ groups }: { groups: GroupSummary[] }) {
  const t = useTranslations("Groups")
  if (groups.length === 0) return <p className="text-sm text-muted-foreground">{t("noGroups")}</p>
  return (
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
  )
}

export function GroupLink({ group }: { group: GroupSummary }) {
  return (
    <Link
      href={groupDetailPath(group.id)}
      className="min-w-0 break-words font-medium underline-offset-4 hover:underline"
    >
      {group.name}
    </Link>
  )
}

/** The member count, with the current Position holders one per line behind it. */
export function GroupFacts({ group }: { group: GroupSummary }) {
  const t = useTranslations("Groups")
  const positionLabel = useTranslations("Groups.positionLabels")
  const members = t("memberCount", { count: group.memberCount })
  if (group.holders.length === 0) return <p className="text-xs text-muted-foreground">{members}</p>

  return (
    <Collapsible>
      <CollapsibleTrigger className={`${EXPAND_TRIGGER} text-xs`}>
        {t("groupFacts", { members, positions: t("positionCount", { count: group.holders.length }) })}
        <ExpandChevron />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          {group.holders.map(({ id, positionCode, position, context, holder }) => (
            <div key={id} className="contents">
              <dt className="text-muted-foreground">
                {positionCode ? positionLabel(positionCodeKey(positionCode)) : position}
                {context ? ` (${context})` : ""}
              </dt>
              <dd>{holder}</dd>
            </div>
          ))}
        </dl>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** The look of a `CollapsibleTrigger` in the overviews; pair it with `ExpandChevron`. */
export const EXPAND_TRIGGER =
  "group/expand flex items-center gap-1 self-start text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"

/** Down while collapsed, up while expanded, inside an `EXPAND_TRIGGER`. */
export function ExpandChevron() {
  return (
    <>
      <ChevronDownIcon className="size-3.5 shrink-0 group-aria-expanded/expand:hidden" aria-hidden="true" />
      <ChevronUpIcon className="hidden size-3.5 shrink-0 group-aria-expanded/expand:inline" aria-hidden="true" />
    </>
  )
}
