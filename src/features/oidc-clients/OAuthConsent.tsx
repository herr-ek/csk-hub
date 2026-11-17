import { verifyOAuthQueryParams } from "@better-auth/oauth-provider"
import { headers } from "next/headers"
import { auth } from "@/core/auth"
import { requirePermission } from "@/core/authz"
import { getTranslations } from "@/core/i18n/server"
import { OAuthConsentForm } from "./OAuthConsentForm"

export async function OAuthConsent({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requirePermission({ action: "app.access" })
  const t = await getTranslations("OidcClients")
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, item)
  }
  const allowed = new Set(["sig", "ba_param", ...params.getAll("ba_param")])
  const query = new URLSearchParams([...params].filter(([key]) => allowed.has(key)))
  if (!(await verifyOAuthQueryParams(query.toString(), (await auth.$context).secret)))
    return <p role="alert">{t("error")}</p>
  const client = await auth.api.getOAuthClientPublic({
    headers: await headers(),
    query: { client_id: query.get("client_id") ?? "" }
  })
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-8">
      <h1 className="text-2xl font-semibold">{t("consentTitle", { name: client.client_name ?? client.client_id })}</h1>
      <p className="break-all">{new URL(query.get("redirect_uri") ?? "").host}</p>
      <p>{t("consentDescription")}</p>
      <p>{query.get("scope")}</p>
      <OAuthConsentForm />
    </main>
  )
}
