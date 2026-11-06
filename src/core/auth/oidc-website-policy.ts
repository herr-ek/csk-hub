import { hasAdminRole } from "@/shared/roles"

export const WEBSITE_SCOPE = "csk:website"
export const WEBSITE_AUTHORIZATION_CLAIM = "https://chalmerssangkor.se/claims/authorization"

const websitePermissions = [
  "website.access",
  "front-page.manage",
  "banner.manage",
  "choir.manage",
  "concert.manage",
  "recruitment.manage",
  "contacts.manage",
  "faq.manage",
  "media.upload",
  "media.manage"
] as const

/** Returns the current website grants for an active Hub User. */
export function getWebsitePermissions(role: unknown, active: boolean): string[] {
  return active && hasAdminRole(role) ? [...websitePermissions] : []
}
