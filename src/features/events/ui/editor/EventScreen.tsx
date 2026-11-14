import { notFound } from "next/navigation"
import { getTranslations } from "@/core/i18n/server"
import { PageBreadcrumb } from "@/core/navigation/PageBreadcrumb"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { StatusBadge } from "../StatusBadge"
import { updateEventAction } from "./actions"
import { EventForm } from "./EventForm"
import { EventLifecycle } from "./EventLifecycle"
import { FormSkeleton } from "./NewEventScreen"
import { getEventEditor } from "./query"

/** One Event's admin page: its lifecycle, and the whole Event to edit. */
export async function EventScreen({ eventId }: { eventId: string }) {
  const [editor, t] = await Promise.all([getEventEditor(eventId), getTranslations("Events")])
  if (!editor) notFound()

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-2">
        <PageBreadcrumb route="adminEvents" current={editor.title} />
        <h1 className="flex flex-wrap items-center gap-2 font-heading text-2xl font-semibold">
          <span className={editor.status === "Cancelled" ? "line-through" : undefined}>{editor.title}</span>
          <StatusBadge status={editor.status} />
        </h1>
      </div>
      <EventLifecycle eventId={editor.id} title={editor.title} status={editor.status} impact={editor.impact} />
      <EventForm
        action={updateEventAction.bind(null, editor.id)}
        initial={editor.values}
        options={editor.options}
        unsavedSlot={editor.id}
        submitLabel={t("editPage.submit")}
      />
    </main>
  )
}

export async function EventScreenSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8" aria-busy="true">
      <div className="flex flex-col gap-2">
        <PageBreadcrumb route="adminEvents" current={<Skeleton className="h-4 w-32" />} />
        <Skeleton className="h-8 w-64" />
      </div>
      <Skeleton className="h-28 w-full rounded-xl" />
      <FormSkeleton />
    </main>
  )
}
