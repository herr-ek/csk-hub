"use client"

import { useState } from "react"
import { LocalizedDialogContent } from "@/core/i18n/localized-controls"
import { useTranslations } from "@/core/i18n/translations"
import { Button } from "@/shared/ui/base/button"
import { Dialog, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/shared/ui/base/dialog"
import { AddUserForm } from "./add-user-form"

export function AddUserDialog() {
  const t = useTranslations("Members")
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button">{t("add")}</Button>} />
      <LocalizedDialogContent>
        <DialogHeader>
          <DialogTitle>{t("add")}</DialogTitle>
          <DialogDescription>{t("addDescription")}</DialogDescription>
        </DialogHeader>
        <AddUserForm />
      </LocalizedDialogContent>
    </Dialog>
  )
}
