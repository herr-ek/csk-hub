import { passkeyClient } from "@better-auth/passkey/client"
import {
  adminClient,
  emailOTPClient,
  magicLinkClient,
  twoFactorClient,
  usernameClient
} from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"
import { adminPluginOptions } from "./permissions"

export const authClient = createAuthClient({
  plugins: [
    twoFactorClient(),
    usernameClient(),
    emailOTPClient(),
    magicLinkClient(),
    passkeyClient(),
    adminClient(adminPluginOptions)
  ]
})
