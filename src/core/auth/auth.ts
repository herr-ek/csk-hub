import { passkey } from "@better-auth/passkey"
import { type BetterAuthOptions, betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { nextCookies } from "better-auth/next-js"
import { admin, emailOTP, magicLink, openAPI, testUtils, twoFactor, username } from "better-auth/plugins"
import { env, isProduction } from "@/core/config/env"
import { db } from "@/core/db"
import * as schema from "@/core/db/schema/auth"
import { adminPluginOptions } from "./permissions"

const authPlugins = [
  username(),
  admin(adminPluginOptions),
  openAPI(),
  twoFactor({
    issuer: "CSK Hub",
    otpOptions: {
      async sendOTP({ user, otp }) {
        const { sendTwoFactorOtpEmail } = await import("@/core/email")
        await sendTwoFactorOtpEmail({ email: user.email, otp })
      }
    }
  }),
  passkey(),
  emailOTP({
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
  })
] as const

export const authOptions = {
  appName: "CSK Hub",
  baseURL: {
    allowedHosts: ["*.vercel.app"],
    fallback: env.BETTER_AUTH_URL
  },
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
  plugins: [...authPlugins, ...(isProduction ? [] : [testUtils()]), nextCookies()]
} satisfies BetterAuthOptions

export const auth = betterAuth(authOptions)
