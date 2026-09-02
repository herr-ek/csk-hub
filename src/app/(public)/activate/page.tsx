import type { Metadata } from "next"
import { Suspense } from "react"
import { ActivationForm } from "@/account/activation"
import { Spinner } from "@/shared/ui/base/spinner"

export const metadata: Metadata = {
  title: "Activate your account · CSK Hub"
}

export default function ActivatePage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ActivationForm />
    </Suspense>
  )
}
