import { getRequestSession } from "@/core/auth/session.server"
import { AccountSettingsTabs } from "./account-settings-tabs"
import { PushNotificationSettings } from "./notifications"
import { LanguageSettings, ProfileSettings } from "./profile"
import { QuickAccessSettings } from "./quick-access"
import { PasskeySettings, PasswordSettings, SessionsSettings, TwoFactorSettings } from "./security"

export async function AccountSettings() {
  const session = await getRequestSession()

  if (!session) {
    return null
  }

  return (
    <AccountSettingsTabs
      profile={
        <div className="flex flex-col gap-6">
          <ProfileSettings member={session.user} />
          <LanguageSettings />
          <QuickAccessSettings />
        </div>
      }
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
