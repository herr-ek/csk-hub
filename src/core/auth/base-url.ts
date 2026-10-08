import type { BetterAuthOptions } from "better-auth"

type BaseURLEnvironment = {
  ENVIRONMENT: "development" | "test" | "preview" | "production"
  BETTER_AUTH_URL: string
  VERCEL_URL?: string
  VERCEL_BRANCH_URL?: string
}

export function getBaseURL(environment: BaseURLEnvironment): NonNullable<BetterAuthOptions["baseURL"]> {
  if (environment.ENVIRONMENT !== "preview") return environment.BETTER_AUTH_URL

  if (!environment.VERCEL_URL) {
    throw new Error("VERCEL_URL is required for preview deployments")
  }

  return {
    allowedHosts: [environment.VERCEL_URL, ...(environment.VERCEL_BRANCH_URL ? [environment.VERCEL_BRANCH_URL] : [])],
    fallback: `https://${environment.VERCEL_URL}`,
    protocol: "https"
  }
}
