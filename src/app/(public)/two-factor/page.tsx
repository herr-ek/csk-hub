import type { Metadata } from "next"
import { Suspense } from "react"
import { TwoFactorForm } from "@/features/account/two-factor"
import { Spinner } from "@/shared/ui/base/spinner"

export const metadata: Metadata = {
  title: "Two-factor verification · CSK Hub"
}

export default function TwoFactorPage() {
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl tracking-normal">Two-factor verification</h1>
        <p className="text-muted-foreground text-sm">Choose how you want to verify your sign-in.</p>
      </header>
      <Suspense fallback={<Spinner />}>
        <TwoFactorForm />
      </Suspense>
    </>
  )
}
