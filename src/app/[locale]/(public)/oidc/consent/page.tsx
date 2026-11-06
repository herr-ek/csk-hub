import { Suspense } from "react"
import { ConsentScreen } from "@/features/account/oidc"
import { Spinner } from "@/shared/ui/base/spinner"

export default function ConsentPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ConsentScreen />
    </Suspense>
  )
}
