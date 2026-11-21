import { Suspense } from "react"
import { OAuthConsent } from "@/features/oidc-clients"
import { Spinner } from "@/shared/ui/base/spinner"

export default function Page({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return (
    <Suspense fallback={<Spinner />}>
      <OAuthConsent searchParams={searchParams} />
    </Suspense>
  )
}
