import { auth } from "@/core/auth"
import { resumeOidcRequest } from "@/core/auth/oidc-resume.server"

export async function GET(request: Request) {
  return resumeOidcRequest(request, auth)
}
