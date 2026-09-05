import { headers } from "next/headers"
import { auth } from "@/core/auth/auth"
import { AccountSettingsTabs } from "./account-settings-tabs"
import { PasskeySettings } from "./passkey-settings"
import { PasswordSettings } from "./password-settings"
import { ProfileSettings } from "./profile-settings"
import { PushNotificationSettings } from "./push-notification-settings"
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
