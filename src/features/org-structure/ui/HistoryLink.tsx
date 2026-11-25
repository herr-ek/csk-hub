import { HistoryIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "@/core/i18n/translations"
import { buttonVariants } from "@/shared/ui/base/button"
import { cn } from "@/shared/utils"
import { groupHistoryPath } from "./command-state"

/** Opens a Group's past participation, where mistakes are corrected. */
export function HistoryLink({
  groupId,
  name
}: {
  groupId: string /** Shows only an icon, labelled with this. */
  name?: string
}) {
  const t = useTranslations("OrgAdmin.history")
  return (
    <Link
      href={groupHistoryPath(groupId)}
      aria-label={name ? t("linkFor", { name }) : undefined}
      className={cn(buttonVariants({ variant: "ghost", size: name ? "icon-xs" : "sm" }))}
    >
      <HistoryIcon aria-hidden="true" />
      {name ? null : t("link")}
    </Link>
  )
}
