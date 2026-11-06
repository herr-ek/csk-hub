import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2"
import { i18n, locales } from "@better-auth/i18n"
import { oauthProvider } from "@better-auth/oauth-provider"
import { passkey } from "@better-auth/passkey"
import { type BetterAuthOptions, betterAuth } from "better-auth"
import { nextCookies } from "better-auth/next-js"
import { admin, emailOTP, jwt, magicLink, openAPI, testUtils, twoFactor, username } from "better-auth/plugins"
import { app } from "@/core/config/app"
import { env, isProduction } from "@/core/config/env"
import { db } from "@/core/db"
import * as schema from "@/core/db/schema/auth"
import { getBaseURL } from "./base-url"
import { validateOidcIssuer, validateOidcRedirectUri } from "./oidc/config"
import { createHubOidcPolicy } from "./oidc/hub-policy"
import { adminPluginOptions } from "./permissions"

validateOidcIssuer(env.OIDC_ISSUER, env.ENVIRONMENT)
const hubOidc = createHubOidcPolicy()

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
    hubOidc.plugin,
    jwt({
      jwt: { issuer: env.OIDC_ISSUER },
      jwks: { keyPairConfig: { alg: "RS256" }, rotationInterval: 60 * 60 * 24 * 30, gracePeriod: 60 * 60 * 24 },
      disableSettingJwtHeader: true
    }),
    oauthProvider({
      loginPage: "/login",
      consentPage: "/oidc/consent",
      scopes: ["openid", "profile"],
      grantTypes: ["authorization_code"],
      allowDynamicClientRegistration: false,
      allowUnauthenticatedClientRegistration: false,
      validateRedirectUri: (uri, registered) => validateOidcRedirectUri(uri, registered, env.ENVIRONMENT),
      signup: { page: "/activate", shouldRedirect: hubOidc.requiresActivation },
      clientPrivileges: hubOidc.activeAdmin,
      resourcePrivileges: hubOidc.activeAdmin,
      customAccessTokenClaims: hubOidc.checkTokenUser,
      customIdTokenClaims: hubOidc.checkTokenUser,
      customUserInfoClaims: hubOidc.checkUserInfo
    }),
    ...(isProduction ? [] : [testUtils()]),
    nextCookies()
  ]
} satisfies BetterAuthOptions

export const auth = betterAuth(authOptions)
