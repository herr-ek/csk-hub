import { z } from "zod"

const translationKeySchema = z.enum(["newMessage", "notification", "groupMessage"])
type TranslationKey = z.infer<typeof translationKeySchema>

/** Serializable toast text, resolved in the viewing browser's locale. Values may contain translated fallbacks. */
export type ActivityToastText = string | { key: TranslationKey; values?: Record<string, ActivityToastText> }

export const activityToastTextSchema: z.ZodType<ActivityToastText> = z.lazy(() =>
  z.union([
    z.string(),
    z.object({ key: translationKeySchema, values: z.record(z.string(), activityToastTextSchema).optional() })
  ])
)

/** Resolves translation descriptors and their parameters without interpreting literal user content as keys. */
export function resolveActivityToastText(
  text: ActivityToastText,
  translate: (key: TranslationKey, values?: Record<string, string>) => string
): string {
  if (typeof text === "string") return text
  const values = text.values
    ? Object.fromEntries(
        Object.entries(text.values).map(([key, value]) => [key, resolveActivityToastText(value, translate)])
      )
    : undefined
  return translate(text.key, values)
}
