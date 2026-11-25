import { i18n, locales } from "@better-auth/i18n"
import { passkey } from "@better-auth/passkey"
import { admin, emailOTP, jwt, magicLink, openAPI, twoFactor, username } from "better-auth/plugins"
import { app } from "@/core/config/app"
import type { Database } from "@/core/db"
import { createOAuthProvider } from "./oauth/provider"
import { adminPluginOptions } from "./permissions"

/** Builds the shared auth pipeline in hook order for production and database-backed tests. */
export function createAuthPlugins(
  database: Database,
  allowLocalCallbacks: boolean,
  sendTwoFactorOtp: (data: { user: { email: string }; otp: string }) => Promise<void>
) {
  return [
    jwt({ disableSettingJwtHeader: true }),
    username(),
    admin(adminPluginOptions),
    openAPI(),
    twoFactor({
      issuer: app.name,
      otpOptions: { sendOTP: sendTwoFactorOtp }
    }),
    passkey(),
    // The provider must see the session cookie after the two-factor hook has run.
    createOAuthProvider(database, allowLocalCallbacks),
    emailOTP({
      disableSignUp: true,
      expiresIn: 60 * 5,
      async sendVerificationOTP({ email, otp, type }) {
        const { sendVerificationOtpEmail } = await import("@/core/email")
        await sendVerificationOtpEmail({ email, otp, type })
      }
    }),
    magicLink({
      disableSignUp: true,
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      async sendMagicLink({ email, url }) {
        const { sendMagicLinkEmail } = await import("@/core/email")
        await sendMagicLinkEmail({ email, url })
      }
    }),
    i18n({
      translations: {
        en: locales.en,
        sv: locales.sv,
        de: locales.de
      }
    })
  ] as const
}
