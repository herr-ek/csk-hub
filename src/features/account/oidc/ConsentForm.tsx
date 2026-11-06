"use client"

import { useState } from "react"
import { authClient } from "@/core/auth/auth-client"
import { useTranslations } from "@/core/i18n/translations"
import { Button } from "@/shared/ui/base/button"

export function ConsentForm({
  application,
  scopes,
  oauthQuery
}: {
  application: string
  scopes: string[]
  oauthQuery: string
}) {
  const t = useTranslations("Oidc")
  const [error, setError] = useState(false)
  const [pending, setPending] = useState(false)

  async function consent(accept: boolean) {
    setPending(true)
    const result = await authClient.oauth2.consent({ accept, oauth_query: oauthQuery })
    if (result.error || !result.data?.url) {
      setError(true)
      setPending(false)
      return
    }
    window.location.assign(result.data.url)
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p>{t("description", { application })}</p>
      <ul className="list-disc pl-5">
        {scopes.map((scope) => (
          <li key={scope}>{scope === "openid" ? t("identity") : scope === "profile" ? t("profile") : scope}</li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-destructive">
          {t("error")}
        </p>
      )}
      <Button disabled={pending} onClick={() => consent(true)}>
        {t("allow")}
      </Button>
      <Button variant="outline" disabled={pending} onClick={() => consent(false)}>
        {t("deny")}
      </Button>
    </section>
  )
}
