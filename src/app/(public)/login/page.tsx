import type { Metadata } from "next"
import { Suspense } from "react"
import { LoginForm } from "@/features/account/login"
import { Spinner } from "@/shared/ui/base/spinner"

export const metadata: Metadata = {
  title: "Sign in · CSK Hub"
}

export default function LoginPage() {
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl tracking-normal">Sign in</h1>
        <p className="text-muted-foreground text-sm">Use your choir account email and password</p>
      </header>
      <Suspense
        fallback={
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </>
  )
}
