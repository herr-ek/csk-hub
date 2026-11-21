import { headers } from "next/headers"
import { Suspense } from "react"
import { auth } from "@/core/auth"
import { OidcClientsScreen } from "@/features/oidc-clients"
import { Spinner } from "@/shared/ui/base/spinner"

async function Clients() {
  const { issuer } = await auth.api.getOpenIdConfig({ headers: await headers() })
  return <OidcClientsScreen discoveryUrl={`${issuer}/.well-known/openid-configuration`} />
}

export default function Page() {
  return (
    <Suspense fallback={<Spinner />}>
      <Clients />
    </Suspense>
  )
}
