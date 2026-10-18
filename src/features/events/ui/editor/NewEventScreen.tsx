import { getTranslations } from "@/core/i18n/server"
import { PageBreadcrumb } from "@/core/navigation/PageBreadcrumb"
import { ROUTES } from "@/core/navigation/site"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { DEFAULT_PARTICIPATION_MODE, EVENT_TYPES, type EventType } from "../../model"
import { createEventAction } from "./actions"
import { EventForm } from "./EventForm"
import { EMPTY_EVENT_FORM, getEventFormOptions } from "./query"

const FIRST_TYPE = EVENT_TYPES[0] as EventType

/** The form for a new Event, which is saved as a Draft. */
export async function NewEventScreen() {
  const [options, t] = await Promise.all([getEventFormOptions(), getTranslations("Events")])

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-2">
        <PageBreadcrumb route="adminEventsNew" />
        <h1 className="font-heading text-2xl font-semibold">{t("newPage.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("newPage.description")}</p>
      </div>
      <EventForm
        action={createEventAction}
        initial={{ ...EMPTY_EVENT_FORM, type: FIRST_TYPE, participationMode: DEFAULT_PARTICIPATION_MODE[FIRST_TYPE] }}
        options={options}
        unsavedSlot="new"
        submitLabel={t("newPage.submit")}
        cancelHref={ROUTES.adminEvents}
      />
    </main>
  )
}

export async function NewEventScreenSkeleton() {
  const t = await getTranslations("Events")
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8" aria-busy="true">
      <div className="flex flex-col gap-2">
        <PageBreadcrumb route="adminEventsNew" />
        <h1 className="font-heading text-2xl font-semibold">{t("newPage.title")}</h1>
      </div>
      <FormSkeleton />
    </main>
  )
}

export function FormSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-48 w-full rounded-xl" />
      ))}
    </div>
  )
}
