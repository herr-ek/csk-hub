import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider"
import { auth } from "@/core/auth"

export const GET = oauthProviderAuthServerMetadata(auth)
