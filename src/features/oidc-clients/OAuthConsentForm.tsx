"use client"

import { useState, useTransition } from "react"
import { authClient } from "@/core/auth/auth-client"
import { useTranslations } from "@/core/i18n/translations"
import { Button } from "@/shared/ui/base/button"

export function OAuthConsentForm() {
  const t = useTranslations("OidcClients")
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState(false)
  function respond(accept: boolean) {
    setError(false)
    startTransition(async () => {
      try {
        const result = await authClient.oauth2.consent({ accept })
        if (result.error) setError(true)
      } catch {
        setError(true)
      }
    })
  }
  return (
    <div className="flex flex-col gap-3">
      {error && <p role="alert">{t("error")}</p>}
      <Button disabled={pending} onClick={() => respond(true)}>
        {t("allow")}
      </Button>
      <Button variant="outline" disabled={pending} onClick={() => respond(false)}>
        {t("deny")}
      </Button>
    </div>
  )
}
