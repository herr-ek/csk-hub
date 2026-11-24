"use client"

import Link from "next/link"
import { useOptimistic, useTransition } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { Button, buttonVariants } from "@/shared/ui/base/button"
import { Card } from "@/shared/ui/base/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/base/select"
import { toast } from "@/shared/ui/base/toast"
import { cn } from "@/shared/utils"
import type { EventStatus } from "../../model"
import { eventManagementPath } from "../command-state"
import { EventCommandDialog } from "../EventCommandDialog"
import { changeEventStatusAction } from "../editor/actions"
import { useEventErrorMessage } from "../errors"
import { StatusBadge } from "../StatusBadge"
import { deleteRehearsalAction, publishRehearsalDraftsAction, setRehearsalLocationAction } from "./actions"

type Row = {
  id: string
  title: string
  status: EventStatus
  when: string
  startsAt: Date
  locationId: string | null
  locationText: string | null
  choirName: string
  seriesName: string
}
type Location = { id: string; name: string; active: boolean }

/** The filtered Series Rehearsals, each with its Location to change and its lifecycle commands. */
export function ScheduledRehearsals({
  rehearsals,
  locations,
  when
}: {
  rehearsals: Row[]
  locations: Location[]
  when: "upcoming" | "past"
}) {
  const t = useTranslations("Events.schedule")
  const drafts = rehearsals.filter(({ status }) => status === "Draft")

  if (rehearsals.length === 0) {
    return <p className="text-sm text-muted-foreground">{t(when === "past" ? "list.noPast" : "list.noUpcoming")}</p>
  }

  return (
    <div className="flex flex-col gap-3">
      {drafts.length > 0 ? (
        <div>
          <EventCommandDialog
            trigger={<Button type="button">{t("publish.button", { count: drafts.length })}</Button>}
            title={t("publish.title")}
            description={t("publish.explanation", { count: drafts.length })}
            action={publishRehearsalDraftsAction}
            submitLabel={t("publish.button", { count: drafts.length })}
            successMessage={t("publish.done")}
          >
            {drafts.map(({ id }) => (
              <input key={id} type="hidden" name="eventId" value={id} />
            ))}
          </EventCommandDialog>
        </div>
      ) : null}
      <Card className="gap-0 divide-y py-0">
        {rehearsals.map((row) => (
          <RehearsalRow key={row.id} row={row} locations={locations} />
        ))}
      </Card>
    </div>
  )
}

function RehearsalRow({ row, locations }: { row: Row; locations: Location[] }) {
  const t = useTranslations("Events.schedule.list")
  const lifecycle = useTranslations("Events.lifecycle")
  const errorMessage = useEventErrorMessage()
  const [pending, startTransition] = useTransition()
  const [locationId, setLocationId] = useOptimistic(row.locationId ?? "")
  // Archived Locations are offered only to the Rehearsal that already has one.
  const options = [
    { value: "", label: t("noLocation") },
    ...locations
      .filter(({ id, active }) => active || id === row.locationId)
      .map(({ id, name }) => ({ value: id, label: name }))
  ]
  const cancelled = row.status === "Cancelled"

  const changeLocation = (next: string) => {
    startTransition(async () => {
      setLocationId(next)
      const state = await setRehearsalLocationAction({ eventId: row.id, locationId: next || null })
      if (state.status === "success") toast.add({ type: "success", title: t("locationSaved") })
      else if (state.status === "error") toast.add({ type: "error", title: errorMessage(state.error) })
    })
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <time dateTime={row.startsAt.toISOString()} className="text-sm text-muted-foreground">
          {row.when}
        </time>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("font-medium", cancelled && "text-muted-foreground line-through")}>{row.title}</span>
          <StatusBadge status={row.status} />
        </div>
        <span className="text-sm text-muted-foreground">
          {t("choirAndSeries", { choir: row.choirName, series: row.seriesName })}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex w-full flex-col gap-1 sm:w-48">
          <Select items={options} value={locationId} onValueChange={(next) => changeLocation(next ?? "")}>
            <SelectTrigger aria-label={t("location", { title: row.title })} aria-busy={pending} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {row.locationText ? <span className="text-xs text-muted-foreground">{row.locationText}</span> : null}
        </div>
        <Link href={eventManagementPath(row.id)} className={buttonVariants({ variant: "outline", size: "sm" })}>
          {t("edit")}
        </Link>
        {row.status === "Published" ? (
          <EventCommandDialog
            trigger={
              <Button type="button" variant="ghost" size="sm">
                {lifecycle("cancel")}
              </Button>
            }
            title={lifecycle("cancelTitle", { title: row.title })}
            description={lifecycle("cancelExplanation")}
            action={changeEventStatusAction}
            submitLabel={lifecycle("cancel")}
            successMessage={lifecycle("cancelDone")}
            destructive
          >
            <input type="hidden" name="eventId" value={row.id} />
            <input type="hidden" name="status" value="Cancelled" />
          </EventCommandDialog>
        ) : null}
        {row.status === "Draft" ? (
          <EventCommandDialog
            trigger={
              <Button type="button" variant="ghost" size="sm" className="text-destructive">
                {lifecycle("delete")}
              </Button>
            }
            title={lifecycle("deleteTitle", { title: row.title })}
            description={
              <>
                <span className="block">{lifecycle("deleteExplanation")}</span>
                {/* A Draft takes no Responses or Registrations, so nothing is recorded for it. */}
                <span className="mt-2 block font-medium">{lifecycle("deleteNothingRecorded")}</span>
              </>
            }
            action={deleteRehearsalAction}
            submitLabel={lifecycle("delete")}
            successMessage={lifecycle("deleteDone")}
            destructive
          >
            <input type="hidden" name="eventId" value={row.id} />
          </EventCommandDialog>
        ) : null}
      </div>
    </div>
  )
}
