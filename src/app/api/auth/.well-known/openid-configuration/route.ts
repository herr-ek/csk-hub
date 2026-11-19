import { oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider"
import { auth } from "@/core/auth"

export const GET = oauthProviderOpenIdConfigMetadata(auth)
