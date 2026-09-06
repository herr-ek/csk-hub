import { passkeyClient } from "@better-auth/passkey/client"
import {
  adminClient,
  emailOTPClient,
  inferAdditionalFields,
  magicLinkClient,
  twoFactorClient,
  usernameClient
} from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"
import type { auth } from "./auth"
import { adminPluginOptions } from "./permissions"

export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields<typeof auth>(),
    twoFactorClient(),
    usernameClient(),
    emailOTPClient(),
    magicLinkClient(),
    passkeyClient(),
    adminClient(adminPluginOptions)
  ]
})
