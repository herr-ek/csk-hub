import { headers } from "next/headers"
import { auth } from "@/core/auth/auth"
import { AccountSettingsTabs } from "./account-settings-tabs"
import { PushNotificationSettings } from "./notifications"
import { ProfileSettings } from "./profile"
import { PasskeySettings, PasswordSettings, SessionsSettings, TwoFactorSettings } from "./security"

export async function AccountSettings() {
  const session = await auth.api.getSession({
    headers: await headers()
  })

  if (!session) {
    return null
  }

  return (
    <AccountSettingsTabs
      profile={<ProfileSettings member={session.user} />}
      security={
        <>
          <PasswordSettings />
          <PasskeySettings />
          <TwoFactorSettings enabled={Boolean(session.user.twoFactorEnabled)} />
          <SessionsSettings currentSessionToken={session.session.token} />
        </>
      }
      notifications={<PushNotificationSettings />}
    />
  )
}
