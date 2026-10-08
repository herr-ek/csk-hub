"use client"

import type { ComponentProps } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { DialogContent, DialogFooter } from "@/shared/ui/base/dialog"

export function LocalizedDialogContent(props: Omit<ComponentProps<typeof DialogContent>, "closeLabel">) {
  const common = useTranslations("Common")
  return <DialogContent {...props} closeLabel={common("close")} />
}

export function LocalizedDialogFooter(props: Omit<ComponentProps<typeof DialogFooter>, "closeLabel">) {
  const common = useTranslations("Common")
  return <DialogFooter {...props} closeLabel={common("close")} />
}
