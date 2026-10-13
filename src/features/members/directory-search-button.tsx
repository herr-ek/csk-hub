"use client"

import { LoaderCircle, Search } from "lucide-react"
import { useFormStatus } from "react-dom"
import { useTranslations } from "@/core/i18n/translations"
import { Button } from "@/shared/ui/base/button"

export function DirectorySearchButton() {
  const { pending } = useFormStatus()
  const t = useTranslations("MemberProfiles")
  return (
    <Button type="submit" disabled={pending} aria-busy={pending}>
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Search className="size-4" aria-hidden="true" />
      )}
      {t(pending ? "searching" : "search")}
    </Button>
  )
}
