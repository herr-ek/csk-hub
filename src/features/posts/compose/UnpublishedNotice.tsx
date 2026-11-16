"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useRef } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { toast } from "@/shared/ui/base/toast"
import { isUnpublishedTo, UNPUBLISHED_NOTICE_PARAM } from "./unpublished-notice"

/**
 * Confirms an unpublish once the User lands on the feed, naming whose drafts the Post went
 * back to, then drops the flag from the URL so reloading or sharing the page does not repeat it.
 */
export function UnpublishedNotice() {
  const t = useTranslations("Posts")
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const shown = useRef(false)
  const flag = searchParams.get(UNPUBLISHED_NOTICE_PARAM)
  const to = isUnpublishedTo(flag) ? flag : null

  useEffect(() => {
    if (!to || shown.current) return
    shown.current = true
    toast.add({
      type: "success",
      title: t("unpublishedTitle"),
      description: t(to === "own" ? "unpublishedToOwnDrafts" : "unpublishedToAuthorDrafts")
    })
    router.replace(pathname, { scroll: false })
  }, [to, pathname, router, t])

  return null
}
