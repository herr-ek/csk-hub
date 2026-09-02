import Link from "next/link"
import { ROUTES } from "@/core/navigation/site"

export function ActivationFailed() {
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl tracking-normal">Activation link expired</h1>
        <p className="text-muted-foreground text-sm">
          This activation link is invalid, expired, or has already been used.
        </p>
      </header>
      <Link href={ROUTES.forgotPassword} className="text-sm underline underline-offset-4">
        Request a fresh password link
      </Link>
    </>
  )
}
