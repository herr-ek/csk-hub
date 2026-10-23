import { useTranslations } from "@/core/i18n/translations"
import { Badge } from "@/shared/ui/base/badge"
import type { EventStatus } from "../model"

const VARIANT = { Draft: "secondary", Published: "default", Cancelled: "destructive" } as const

export function StatusBadge({ status }: { status: EventStatus }) {
  const t = useTranslations("Events.statuses")
  return <Badge variant={VARIANT[status]}>{t(status)}</Badge>
}
