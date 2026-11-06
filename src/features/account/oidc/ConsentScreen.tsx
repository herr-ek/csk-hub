"use client"

import { useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { authClient } from "@/core/auth/auth-client"
import { getAuthorizationQuery } from "@/core/auth/oidc-continuation"
import { useTranslations } from "@/core/i18n/translations"
import { Button } from "@/shared/ui/base/button"

export function ConsentScreen() {
  const t = useTranslations("Oidc")
  const params = useSearchParams()
  const [name, setName] = useState<string>()
  const [error, setError] = useState(false)
  const [pending, setPending] = useState(false)
  const clientId = params.get("client_id")
  useEffect(() => {
    let cancelled = false
    fetch(`/api/auth/oauth2/public-client?client_id=${encodeURIComponent(clientId ?? "")}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("invalid_client")
        const client = await response.json()
        if (!cancelled) setName(client.client_name ?? client.client_id)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [clientId])

  async function consent(accept: boolean) {
    const query = getAuthorizationQuery(params.toString())
    if (!query) {
      setError(true)
      return
    }
    setPending(true)
    const result = await authClient.oauth2.consent({ accept, oauth_query: query })
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
      <p>{t("description", { application: name ?? "…" })}</p>
      <ul className="list-disc pl-5">
        {(params.get("scope") ?? "")
          .split(" ")
          .filter(Boolean)
          .map((scope) => (
            <li key={scope}>{scope === "openid" ? t("identity") : scope === "profile" ? t("profile") : scope}</li>
          ))}
      </ul>
      {error && (
        <p role="alert" className="text-destructive">
          {t("error")}
        </p>
      )}
      <Button disabled={pending || !name} onClick={() => consent(true)}>
        {t("allow")}
      </Button>
      <Button variant="outline" disabled={pending || !name} onClick={() => consent(false)}>
        {t("deny")}
      </Button>
    </section>
  )
}
