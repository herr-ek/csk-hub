"use client"

import { useTranslations } from "@/core/i18n/translations"
import { Button } from "@/shared/ui/base/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/base/card"
import type { EventDeletionImpact } from "../../lifecycle"
import { type EventStatus, statusChangesFrom } from "../../model"
import { EventCommandDialog } from "../EventCommandDialog"
import { changeEventStatusAction, deleteEventAction } from "./actions"

/** What moving from one status to another is called. */
const STATUS_CHANGE: Record<EventStatus, Partial<Record<EventStatus, "publish" | "cancel" | "reinstate">>> = {
  Draft: { Published: "publish" },
  Published: { Cancelled: "cancel" },
  Cancelled: { Published: "reinstate" }
}

/** The lifecycle commands an Event in its status offers, and deleting it, which every status offers. */
export function EventLifecycle({
  eventId,
  title,
  status,
  impact
}: {
  eventId: string
  title: string
  status: EventStatus
  impact: EventDeletionImpact
}) {
  const t = useTranslations("Events.lifecycle")
  const recorded = impact.responses + impact.registrations + impact.attendance

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t(`${status}Description`)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {statusChangesFrom(status).map((next) => {
          const change = STATUS_CHANGE[status][next]
          if (!change) return null
          return (
            <EventCommandDialog
              key={next}
              trigger={
                <Button type="button" variant={change === "cancel" ? "outline" : "default"}>
                  {t(change)}
                </Button>
              }
              title={t(`${change}Title`, { title })}
              description={t(`${change}Explanation`)}
              action={changeEventStatusAction}
              submitLabel={t(change)}
              successMessage={t(`${change}Done`)}
              destructive={change === "cancel"}
            >
              <input type="hidden" name="eventId" value={eventId} />
              <input type="hidden" name="status" value={next} />
            </EventCommandDialog>
          )
        })}
        <EventCommandDialog
          trigger={
            <Button type="button" variant="ghost" className="text-destructive">
              {t("delete")}
            </Button>
          }
          title={t("deleteTitle", { title })}
          description={
            <>
              <span className="block">{t("deleteExplanation")}</span>
              <span className="mt-2 block font-medium">
                {recorded > 0 ? t("deleteRemoves", { ...impact }) : t("deleteNothingRecorded")}
              </span>
            </>
          }
          action={deleteEventAction}
          submitLabel={t("delete")}
          successMessage={t("deleteDone")}
          destructive
        >
          <input type="hidden" name="eventId" value={eventId} />
        </EventCommandDialog>
      </CardContent>
    </Card>
  )
}
