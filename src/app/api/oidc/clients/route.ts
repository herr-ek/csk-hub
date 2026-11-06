import { auth } from "@/core/auth"
import { createOidcClientHandler } from "@/core/auth/oidc/clients.server"

const handleOidcClients = createOidcClientHandler(auth)

export const GET = handleOidcClients
export const POST = handleOidcClients
export const PATCH = handleOidcClients
