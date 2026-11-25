import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2"
import { type BetterAuthOptions, betterAuth } from "better-auth"
import { nextCookies } from "better-auth/next-js"
import { testUtils } from "better-auth/plugins"
import { app } from "@/core/config/app"
import { env, isProduction } from "@/core/config/env"
import { db } from "@/core/db"
import * as schema from "@/core/db/schema/auth"
import { createAuthPlugins } from "./auth-plugins"
import { getBaseURL } from "./base-url"
import { oauthDisabledPaths } from "./oauth/provider"

export const authOptions = {
  appName: app.name,
  disabledPaths: ["/token", ...oauthDisabledPaths],
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
    ...createAuthPlugins(
      db,
      env.ENVIRONMENT === "development" && process.env.NODE_ENV !== "production",
      async ({ user, otp }) => {
        const { sendTwoFactorOtpEmail } = await import("@/core/email")
        await sendTwoFactorOtpEmail({ email: user.email, otp })
      }
    ),
    ...(isProduction ? [] : [testUtils()]),
    nextCookies()
  ]
} satisfies BetterAuthOptions

export const auth = betterAuth(authOptions)
