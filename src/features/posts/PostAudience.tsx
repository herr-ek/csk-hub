import { useTranslations } from "@/core/i18n/translations"
import { Badge } from "@/shared/ui/base/badge"
import { cn } from "@/shared/utils"
import type { NewsFeedEntry } from "./service"

/** Matching audience targets only; server reads filter membership before rendering these chips. */
export function PostAudience({
  audienceAll,
  targets,
  className
}: Pick<NewsFeedEntry, "audienceAll" | "targets"> & { className?: string }) {
  const t = useTranslations("Posts")
  const labels = audienceAll
    ? [t("allCsk")]
    : targets.map(({ groupName, voiceFamily }) => {
        if (voiceFamily)
          return groupName
            ? t("voiceInGroup", { voice: voiceFamily, group: groupName })
            : t("voiceInCsk", { voice: voiceFamily })
        return groupName ?? t("allCsk")
      })
  if (labels.length === 0) return null
  return (
    <div role="group" aria-label={t("audienceLabel")} className={cn("flex flex-wrap gap-1.5", className)}>
      {labels.map((label, index) => (
        <Badge
          key={index}
          variant="outline"
          className="h-auto max-w-full bg-muted/40 py-0.5 font-normal whitespace-normal break-words"
        >
          {label}
        </Badge>
      ))}
    </div>
  )
}
