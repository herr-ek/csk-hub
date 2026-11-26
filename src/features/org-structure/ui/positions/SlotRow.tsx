"use client"

import Link from "next/link"
import { useFormatter, useTranslations } from "@/core/i18n/translations"
import { type GroupType, positionCodeKey, shiftDate } from "@/core/org-structure"
import { Badge } from "@/shared/ui/base/badge"
import { Button } from "@/shared/ui/base/button"
import { holdersByStatus, yearPhase } from "../../roster"
import type { PositionSlot, SlotHolder } from "../../roster-reads"
import { usePeople } from "../PeopleContext"
import { FillPositionDialog, usePositionName, VacatePositionDialog } from "./PositionDialogs"

/**
 * One Position: who holds it, who is planned to, and the way to change that. A finished year lists
 * everyone who held it. `managedAt` points at the page that owns a Position shown elsewhere.
 */
export function SlotRow({
  slot,
  label,
  helpers,
  only,
  managedAt
}: {
  slot: PositionSlot
  label?: string
  helpers?: { userId: string; type: GroupType }[]
  /** Limits who can take the Position to these Users. */
  only?: string[]
  managedAt?: { href: string; label: string }
}) {
  const t = useTranslations("OrgAdmin.positions")
  const labels = useTranslations("Groups.positionLabels")
  const positionName = usePositionName()
  const { today } = usePeople()
  const { current, planned, ended } = holdersByStatus(slot.holders, today)
  const phase = slot.organisationYear === null ? "current" : yearPhase(slot.organisationYear, today)
  const shown = current ?? (phase === "planned" ? (planned[0] ?? null) : null)
  const later = planned.filter((holder) => holder !== shown)

  return (
    <div className="flex min-h-12 items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label ?? labels(positionCodeKey(slot.positionCode))}</p>
        {phase === "ended" ? (
          <PastHolders holders={ended} />
        ) : (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {shown ? (
              <HolderLink holder={shown} />
            ) : (
              <span className="text-muted-foreground italic">{t("vacant")}</span>
            )}
            {shown && shown !== current ? <Badge variant="outline">{t("planned")}</Badge> : null}
            {shown?.inactive ? <Badge variant="destructive">{t("inactive")}</Badge> : null}
          </p>
        )}
        {phase === "ended"
          ? null
          : later.map((holder) => <LaterHolder key={holder.appointmentId} slot={slot} holder={holder} />)}
      </div>
      {phase === "ended" ? null : managedAt ? (
        <Link
          href={managedAt.href}
          className="shrink-0 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          {managedAt.label}
        </Link>
      ) : (
        <div className="flex shrink-0 items-center">
          <FillPositionDialog
            slot={slot}
            helpers={helpers}
            only={only}
            trigger={
              <Button
                type="button"
                size="sm"
                variant={shown && !shown.inactive ? "ghost" : "outline"}
                aria-label={t("actionFor", {
                  action: shown ? t(shown === current ? "replace" : "change") : t("fill"),
                  position: positionName(slot)
                })}
              >
                {shown ? t(shown === current ? "replace" : "change") : t("fill")}
              </Button>
            }
          />
          {shown ? <VacatePositionDialog slot={slot} holder={shown} /> : null}
        </div>
      )}
    </div>
  )
}

function HolderLink({ holder }: { holder: SlotHolder }) {
  if (holder.inactive) return <span className="font-medium">{holder.name}</span>
  return (
    <Link
      href={`/members/${encodeURIComponent(holder.userId)}`}
      className="font-medium underline-offset-4 hover:underline"
    >
      {holder.name}
    </Link>
  )
}

function LaterHolder({ slot, holder }: { slot: PositionSlot; holder: SlotHolder }) {
  const t = useTranslations("OrgAdmin.positions")
  const date = useShortDate()
  return (
    <p className="flex items-center gap-1 text-xs text-muted-foreground">
      {t("fromDate", { name: holder.name, date: date(holder.startDate) })}
      <VacatePositionDialog slot={slot} holder={holder} />
    </p>
  )
}

function PastHolders({ holders }: { holders: SlotHolder[] }) {
  const t = useTranslations("OrgAdmin.positions")
  const date = useShortDate()
  if (holders.length === 0) return <p className="text-muted-foreground italic">{t("nobody")}</p>
  return (
    <ul>
      {holders.map((holder) => (
        <li key={holder.appointmentId}>
          <span className="font-medium">{holder.name}</span>{" "}
          <span className="text-xs text-muted-foreground">
            {t("period", {
              start: date(holder.startDate),
              end: holder.endDate ? date(shiftDate(holder.endDate, -1)) : ""
            })}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function useShortDate() {
  const format = useFormatter()
  return (date: string) => format.dateTime(new Date(`${date}T12:00:00Z`), { dateStyle: "medium" })
}
