import { Suspense } from "react"
import { auth } from "@/core/auth"
import { OidcClientsScreen } from "@/features/oidc-clients"
import { Spinner } from "@/shared/ui/base/spinner"

async function Clients() {
  const context = await auth.$context
  return <OidcClientsScreen discoveryUrl={`${context.baseURL}/.well-known/openid-configuration`} />
}

export default function Page() {
  return (
    <Suspense fallback={<Spinner />}>
      <Clients />
    </Suspense>
  )
}
