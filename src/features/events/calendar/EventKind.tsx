import { useTranslations } from "@/core/i18n/translations"
import type { EventType, RehearsalKind } from "../model"

/** What kind of Event it is: a Rehearsal by its derived kind, any other Event by its type. */
export function EventKind({ type, rehearsalKind }: { type: EventType; rehearsalKind: RehearsalKind | null }) {
  const types = useTranslations("Events.types")
  const kinds = useTranslations("Events.calendar.rehearsalKinds")
  return rehearsalKind ? kinds(rehearsalKind) : types(type)
}
