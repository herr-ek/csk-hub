import { Suspense } from "react"
import { ConsentScreen } from "@/features/account/oidc"
import { Spinner } from "@/shared/ui/base/spinner"

export default function ConsentPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return (
    <Suspense fallback={<Spinner />}>
      <ConsentScreen searchParams={searchParams} />
    </Suspense>
  )
}
