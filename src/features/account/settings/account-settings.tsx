import { headers } from "next/headers"
import { auth } from "@/core/auth/auth"
import { PasskeySettings } from "./passkey-settings"
import { PasswordSettings } from "./password-settings"
import { ProfileSettings } from "./profile-settings"
import { SessionsSettings } from "./sessions-settings"
import { TwoFactorSettings } from "./two-factor-settings"

export async function AccountSettings() {
  const session = await auth.api.getSession({
    headers: await headers()
  })

  if (!session) {
    return null
  }

  return (
    <>
      <ProfileSettings member={session.user} />
      <PasswordSettings />
      <PasskeySettings />
      <TwoFactorSettings enabled={Boolean(session.user.twoFactorEnabled)} />
      <SessionsSettings currentSessionToken={session.session.token} />
    </>
  )
}
