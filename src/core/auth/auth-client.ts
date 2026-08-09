import { adminClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"
import { adminPluginOptions } from "./permissions"

export const authClient = createAuthClient({
  plugins: [adminClient(adminPluginOptions)]
})
