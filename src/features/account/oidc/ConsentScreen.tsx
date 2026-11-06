import { APIError } from "better-auth/api"
import { io } from "next/cache"
import { headers } from "next/headers"
import { auth } from "@/core/auth/auth"
import { getVerifiedConsentQuery } from "@/core/auth/oidc-consent.server"
import { getTranslations } from "@/core/i18n/server"
import { ConsentForm } from "./ConsentForm"

export async function ConsentScreen({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await io()
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, item)
  }
  const { secret } = await auth.$context
  const verified = await getVerifiedConsentQuery(params.toString(), secret)
  let application: string | undefined
  if (verified) {
    try {
      const client = await auth.api.getOAuthClientPublic({
        headers: await headers(),
        query: { client_id: verified.clientId }
      })
      application = client.client_name ?? client.client_id
    } catch (error) {
      if (!(error instanceof APIError)) throw error
    }
  }
  if (!verified || !application) {
    const t = await getTranslations("Oidc")
    return (
      <p role="alert" className="text-destructive">
        {t("error")}
      </p>
    )
  }
  return <ConsentForm application={application} scopes={verified.scopes} oauthQuery={verified.oauthQuery} />
}
