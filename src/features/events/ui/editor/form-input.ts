import { z } from "zod"
import type { EventInput } from "../../events"
import {
  EVENT_TYPES,
  type EventType,
  isIsoDate,
  isLocalDateTime,
  PARTICIPATION_MODES,
  type ParticipationMode,
  stockholmInstant
} from "../../model"
import { DETAIL_LABEL_MAX_LENGTH, LONG_TEXT_MAX_LENGTH, SHORT_TEXT_MAX_LENGTH, TITLE_MAX_LENGTH } from "../limits"

// How the Event form travels: one field per value, and the Target and Event detail rows as
// `target.<row>.<field>` and `detail.<row>.<field>`, in the order the form shows them. Rules the
// module enforces, such as a blank title or an end before the start, are left to the module, so
// its violation can name the field.

const VOICE_FAMILIES = ["S", "A", "T", "B"] as const

/** A field's value, with an empty string read as absent. */
function value(formData: FormData, name: string) {
  const raw = formData.get(name)
  return typeof raw === "string" && raw.trim() !== "" ? raw : undefined
}

/** The rows named `<prefix>.<row>.<field>`, in the order their first field appears in the form. */
export function rows(formData: FormData, prefix: string) {
  const found = new Map<string, Record<string, string>>()
  for (const [name, raw] of formData.entries()) {
    const match = new RegExp(`^${prefix}\\.([\\w-]+)\\.(\\w+)$`).exec(name)
    if (!match || typeof raw !== "string") continue
    const [, row, field] = match as unknown as [string, string, string]
    found.set(row, { ...found.get(row), [field]: raw })
  }
  return [...found.values()]
}

/** The submitted Event form, shaped for `eventFormSchema`. */
export function readEventForm(formData: FormData) {
  const allDay = formData.get("allDay") === "true"
  return {
    type: value(formData, "type"),
    title: String(formData.get("title") ?? ""),
    description: value(formData, "description"),
    schedule: allDay
      ? { allDay, firstDay: value(formData, "firstDay"), lastDay: value(formData, "lastDay") }
      : { allDay, startsAt: value(formData, "startsAt"), endsAt: value(formData, "endsAt") },
    callTime: allDay ? undefined : value(formData, "callTime"),
    respondBy: value(formData, "respondBy"),
    participationMode: value(formData, "participationMode"),
    locationId: value(formData, "locationId"),
    locationText: value(formData, "locationText"),
    organiserGroupId: value(formData, "organiserGroupId"),
    rehearsal: { leaderUserId: value(formData, "leaderUserId") },
    gig: {
      responsibleUserId: value(formData, "responsibleUserId"),
      contactName: value(formData, "contactName"),
      contactDetails: value(formData, "contactDetails")
    },
    social: { costInfo: value(formData, "costInfo") },
    targets: rows(formData, "target").map((row) => ({
      groupId: row.groupId || undefined,
      voiceFamily: row.voiceFamily || undefined
    })),
    details: rows(formData, "detail").map((row) => ({ label: row.label ?? "", value: row.value ?? "" }))
  }
}

const instant = z
  .string()
  .refine(isLocalDateTime)
  .transform((local) => stockholmInstant(local) as Date)
const date = z.string().refine(isIsoDate)
const optionalText = (max: number) => z.string().max(max).optional()
const optionalId = z.string().min(1).max(SHORT_TEXT_MAX_LENGTH).optional()

/** The editor's document as JSON; the module decides what of it to keep. */
const description = z
  .string()
  .optional()
  .transform((json, ctx) => {
    if (!json) return null
    try {
      return JSON.parse(json) as unknown
    } catch {
      ctx.addIssue({ code: "custom", message: "The description is not a document." })
      return z.NEVER
    }
  })

/** The Event form as the module's `EventInput`. */
export const eventFormSchema = z
  .object({
    type: z.enum(EVENT_TYPES as [EventType, ...EventType[]]),
    title: z.string().max(TITLE_MAX_LENGTH),
    description,
    schedule: z.discriminatedUnion("allDay", [
      z.object({ allDay: z.literal(false), startsAt: instant, endsAt: instant }),
      z.object({ allDay: z.literal(true), firstDay: date, lastDay: date })
    ]),
    callTime: instant.optional(),
    respondBy: instant.optional(),
    participationMode: z.enum(PARTICIPATION_MODES as [ParticipationMode, ...ParticipationMode[]]),
    locationId: z.uuid().optional(),
    locationText: optionalText(SHORT_TEXT_MAX_LENGTH),
    organiserGroupId: z.uuid().optional(),
    rehearsal: z.object({ leaderUserId: optionalId }),
    gig: z.object({
      responsibleUserId: optionalId,
      contactName: optionalText(SHORT_TEXT_MAX_LENGTH),
      contactDetails: optionalText(LONG_TEXT_MAX_LENGTH)
    }),
    social: z.object({ costInfo: optionalText(LONG_TEXT_MAX_LENGTH) }),
    targets: z
      .array(z.object({ groupId: z.uuid().optional(), voiceFamily: z.enum(VOICE_FAMILIES).optional() }))
      .max(50),
    details: z
      .array(z.object({ label: z.string().max(DETAIL_LABEL_MAX_LENGTH), value: z.string().max(LONG_TEXT_MAX_LENGTH) }))
      .max(50)
  })
  .transform(
    (form): EventInput => ({
      ...form,
      targets: form.targets.map(({ groupId, voiceFamily }) => ({
        groupId: groupId ?? null,
        voiceFamily: voiceFamily ?? null
      }))
    })
  )
