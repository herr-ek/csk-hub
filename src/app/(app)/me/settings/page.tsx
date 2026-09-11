import { Suspense } from "react"
import { AccountSettings, AccountSettingsSkeleton } from "@/features/account/settings"

export default function SettingsPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Account settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your profile, security, and notifications.</p>
      </div>
      <Suspense fallback={<AccountSettingsSkeleton />}>
        <AccountSettings />
      </Suspense>
    </main>
  )
}
