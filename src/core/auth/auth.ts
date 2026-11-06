import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2"
import { i18n, locales } from "@better-auth/i18n"
import { passkey } from "@better-auth/passkey"
import { type BetterAuthOptions, betterAuth } from "better-auth"
import { nextCookies } from "better-auth/next-js"
import { admin, emailOTP, magicLink, openAPI, testUtils, twoFactor, username } from "better-auth/plugins"
import { app } from "@/core/config/app"
import { env, isProduction } from "@/core/config/env"
import { db } from "@/core/db"
import * as schema from "@/core/db/schema/auth"
import { getBaseURL } from "./base-url"
import { createOidcPlugins } from "./oidc-provider"
import { adminPluginOptions } from "./permissions"

const issuerOrigin = new URL(env.OIDC_ISSUER).origin
const deploymentOrigin =
  env.ENVIRONMENT === "preview" ? `https://${env.VERCEL_URL}` : new URL(env.BETTER_AUTH_URL).origin
if (issuerOrigin !== deploymentOrigin) throw new Error("OIDC_ISSUER must belong to this deployment")

const authPlugins = [
  username(),
  admin(adminPluginOptions),
  openAPI(),
  twoFactor({
    issuer: app.name,
    otpOptions: {
      async sendOTP({ user, otp }) {
        const { sendTwoFactorOtpEmail } = await import("@/core/email")
        await sendTwoFactorOtpEmail({ email: user.email, otp })
      }
    }
  }),
  passkey(),
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

export const authOptions = {
  appName: app.name,
  disabledPaths: ["/token"],
  baseURL: getBaseURL(env),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    requireEmailVerification: isProduction,
    sendResetPassword: async ({ user, url }) => {
      const { sendResetPasswordEmail } = await import("@/core/email")
      await sendResetPasswordEmail({ user, url })
    },
    revokeSessionsOnPasswordReset: true
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 300 // 5 minutes
    }
  },
  plugins: [
    ...authPlugins,
    ...createOidcPlugins({ database: db, issuer: env.OIDC_ISSUER, environment: env.ENVIRONMENT }),
    ...(isProduction ? [] : [testUtils()]),
    nextCookies()
  ]
} satisfies BetterAuthOptions

export const auth = betterAuth(authOptions)
